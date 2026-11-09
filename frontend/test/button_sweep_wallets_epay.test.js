import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

const ZONE = [
  'views/wallets/WalletsView.tsx',
  'views/epay/EpayView.tsx',
  'views/insurance/InsuranceContractsView.tsx',
  'components/ControlledDrugsRegisterModal.tsx',
  'components/DrugInteractionManagerModal.tsx',
  'components/DrugReferenceImportModal.tsx',
  'components/SpecializedPharmacyReportsModal.tsx',
  'components/PharmacyStocktakingModal.tsx',
  'components/DataQualityAuditModal.tsx',
];

// Selectable tiles / segmented tabs are intentionally not AppButton: they keep a solid "selected" fill.
const SELECTABLE_HANDLERS = /handleAccountTypeChange|setTxType|setActiveTab\(|setProfSubView|setActiveFilter|setStatusFilter|setSelectedTerminalId|handleSelectServicePreset|setPaymentDestination/;

const rawButtonTags = (src) => [...src.matchAll(/<button\b[\s\S]*?\n\s*>/g)].map((m) => m[0]);

describe('button sweep: wallets / e-pay / insurance / pharmacy tools', () => {
  it('every file imports the shared AppButton', () => {
    for (const f of ZONE) {
      assert.match(read(f), /import \{ AppButton \} from '(?:\.\.\/\.\.\/components|\.)\/AppButton'/, f);
    }
  });

  it('has no leftover local button constant sets, dead classes or h-8.5', () => {
    for (const f of ZONE) {
      const src = read(f);
      assert.doesNotMatch(src, /\b(QUICK_BTN\w*|PRIMARY_BUTTON_CLASS|SECONDARY_BUTTON_CLASS|DANGER_BUTTON_CLASS|FOOTER_BTN|BTN_\w+)\b/, f);
      assert.doesNotMatch(src, /active:scale-|(?<![\w-])(?:warn-hover|danger-hover|brand-darker|warn-dark|h-8\.5)(?![\w-])/, f);
    }
  });

  it('has no hand-written solid brand/paid/danger/warn buttons outside the selectable tiles', () => {
    for (const f of ZONE) {
      for (const tag of rawButtonTags(read(f))) {
        if (!/\bbg-(?:brand|paid|danger|warn)(?![\w-])(?!\/)/.test(tag)) continue;
        assert.match(tag, SELECTABLE_HANDLERS, f + ': solid raw button ' + tag.slice(0, 120));
      }
    }
  });

  it('raw buttons keep an explicit type and icon-only ones an aria-label', () => {
    for (const f of ZONE) {
      for (const tag of rawButtonTags(read(f))) {
        assert.match(tag, /type=/, f + ': <button without type ' + tag.slice(0, 80));
      }
    }
    for (const f of ZONE) {
      const src = read(f);
      for (const b of src.match(/<AppButton\b[^>]*?\/>/gs) ?? []) assert.match(b, /aria-label=/, f + ': ' + b.slice(0, 80));
      for (const tag of rawButtonTags(src)) {
        if (/<X\b/.test(src.slice(src.indexOf(tag), src.indexOf(tag) + tag.length + 120))) assert.match(tag, /aria-label=/, f);
      }
    }
  });

  it('wallet account cards: labelled action footer instead of the tiny corner icons', () => {
    const src = read('views/wallets/WalletsView.tsx');
    const card = src.slice(src.indexOf('Account Cards Grid'), src.indexOf('SUB-TAB 3'));
    assert.match(card, /-mx-4 -mb-4 px-4 py-3 border-t[^"]*flex flex-wrap items-center gap-2/);
    assert.match(card, /variant="successSoft"\s+size="sm"\s+icon=\{Plus\}[\s\S]{0,300}?[}"]\s*>\s*شحن\s*<\/AppButton>/);
    assert.match(card, /variant="secondary"\s+size="sm"\s+icon=\{Pencil\}[\s\S]*?>\s*تعديل\s*<\/AppButton>/);
    assert.match(card, /variant="soft"\s+size="sm"\s+icon=\{Star\}[\s\S]*?>\s*اجعله الرئيسي\s*<\/AppButton>/);
    assert.match(card, /variant="dangerSubtle"\s+size="sm"\s+icon=\{Trash2\}[\s\S]*?>\s*حذف\s*<\/AppButton>/);
    assert.doesNotMatch(card, /<button/, 'no raw buttons are left inside the account cards');
    // permission gates and handlers are unchanged
    assert.match(card, /canFund && \(\s*<AppButton[\s\S]*?handleOpenFundingModal\(acc\.id\)/);
    assert.match(card, /canManageAccounts && \(\s*<AppButton[\s\S]*?handleOpenAccountModal\(acc\)/);
    assert.match(card, /canManageAccounts && acc\.isDefault !== true && \(\s*<AppButton[\s\S]*?handleSetDefaultAccount\(acc\)/);
    assert.match(card, /handleDeleteAccount\(acc\)/);
    // the main-account badge stays informational
    assert.match(card, /data-testid="main-account-badge"/);
    assert.doesNotMatch(card.slice(card.indexOf('main-account-badge') - 400, card.indexOf('main-account-badge') + 400), /onClick/);
  });

  it('page-level creates are primary md (e-pay no longer uses a green fill)', () => {
    const wallets = read('views/wallets/WalletsView.tsx');
    assert.match(wallets, /variant="primary" size="md" icon=\{PlusCircle\}[\s\S]{0,120}?\}>\s*إضافة محفظة \/ حساب بنكي/);
    const epay = read('views/epay/EpayView.tsx');
    const creates = epay.match(/<AppButton variant="primary" size="md" icon=\{PlusCircle\}[\s\S]{0,120}?\}>\s*إضافة ماكينة جديدة/g) ?? [];
    assert.equal(creates.length, 2, 'header + empty-state create');
    const insurance = read('views/insurance/InsuranceContractsView.tsx');
    for (const label of ['إضافة شركة تأمين', 'تسجيل مشترك جديد', 'إصدار دفعة مطالبة مجمعة']) {
      assert.match(insurance, new RegExp('variant="primary"\\s+size="md"\\s+icon=\\{Plus\\}[\\s\\S]{0,600}?>\\s*' + label), label);
    }
  });

  it('e-pay terminal cards use the same labelled footer', () => {
    const src = read('views/epay/EpayView.tsx');
    const card = src.slice(src.indexOf('Terminals Cards Grid'), src.indexOf('Fundings History Table'));
    assert.match(card, /-mx-5 -mb-5 px-5 py-3 border-t[^"]*flex flex-wrap items-center gap-2/);
    assert.match(card, /variant="successSoft"\s+size="sm"\s+fullWidth\s+icon=\{Zap\}/);
    assert.match(card, /variant="secondary" size="sm" icon=\{Edit3\}[\s\S]{0,200}?\}\s*>\s*تعديل/);
    assert.match(card, /variant="dangerSubtle"\s+size="sm"\s+icon=\{Trash2\}/);
    assert.doesNotMatch(card, /<button/);
  });

  it('insurance cards: labelled edit actions replace the text links', () => {
    const src = read('views/insurance/InsuranceContractsView.tsx');
    assert.match(src, /variant="secondary"\s+size="xs"\s+icon=\{Pencil\}/);
    assert.match(src, /variant="soft"\s+size="sm"\s+icon=\{Plus\}[\s\S]*?إضافة عقد فئة جديدة/);
    assert.match(src, /variant="secondary"\s+size="sm"\s+icon=\{Pencil\}[\s\S]*?تعديل الشركة/);
    assert.doesNotMatch(src, /hover:underline/);
    assert.doesNotMatch(src, /bg-red-50|border-red-200/);
  });
});
