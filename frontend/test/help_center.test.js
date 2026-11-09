import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FAQS,
  HELP_ARTICLES,
  isHelpSectionAllowed,
  normalizeHelpText,
  resolveHelpSection,
  searchHelp,
} from '../src/utils/helpContent.ts';
import { openHelpCenter } from '../src/utils/helpService.ts';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
// CRLF-safe: sources may be checked out with either line ending
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const MODAL = read(join(SRC, 'components', 'HelpCenterModal.tsx'));
const CONTENT = read(join(SRC, 'utils', 'helpContent.ts'));
const SERVICE = read(join(SRC, 'utils', 'helpService.ts'));

const steps = HELP_ARTICLES.flatMap((a) => a.steps.map((s) => ({ ...s, article: a })));
const textOf = (parts) => parts.join('\n');
const CONTENT_TEXT = textOf([
  ...HELP_ARTICLES.flatMap((a) => [a.title, a.summary, a.goldenRule, a.troubleshooting ?? '', ...a.keywords, ...a.steps.flatMap((s) => [s.title, s.description, s.shortcut ?? ''])]),
  ...FAQS.flatMap((f) => [f.question, f.answer, f.category, f.tag]),
]);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('help center: keyboard keys match what the app really does', () => {
  it('every shortcut badge is made only of keys that exist', () => {
    const allowed = /^(F(?:[1-9]|1[0-2])|Ctrl \+ (?:Q|Z|F8)|Alt \+ (?:[1-9]|N)|Enter|Esc|\/)$/;
    const badges = steps.filter((s) => s.shortcut).flatMap((s) => s.shortcut.split(' / ').map((k) => ({ k, step: s.title })));
    assert.ok(badges.length > 15);
    for (const { k, step } of badges) assert.match(k, allowed, `"${k}" on step "${step}" is not a real key`);
  });

  it('the real keys are all documented', () => {
    for (const key of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'Ctrl + Q', 'Alt + N', 'Ctrl + Z', 'Ctrl + F8', 'Alt + 1', 'Alt + 9']) {
      assert.ok(CONTENT_TEXT.includes(key), `${key} is not documented`);
    }
    assert.ok(steps.some((s) => s.shortcut === '/' && /وحدة/.test(s.description)), 'the "/" packaging-unit key');
  });

  it('each key sits next to the action it really performs', () => {
    const meaning = {
      F2: /بحث|باركود/,
      F3: /كمية|وزن/,
      F4: /خصم/,
      F6: /تعليق|معلق/,
      F7: /تفريغ|مسح السلة/,
      F8: /ملصق|استيكر|قارئ/,
      F9: /دفع|وصل|طباعة/,
      F10: /إنستاباي|آجل/,
      F11: /مرتجع/,
      F12: /فوري/,
      'Ctrl + Z': /حذف|تراجع/,
      'Ctrl + Q': /نواقص|ناقص/,
      Enter: /بحث|إضافة|Enter/,
    };
    for (const s of steps) {
      for (const key of (s.shortcut ?? '').split(' / ')) {
        if (!meaning[key]) continue;
        assert.match(`${s.title} ${s.description}`, meaning[key], `step "${s.title}" shows ${key} but does not describe it`);
      }
    }
  });

  it('no removed or never-implemented key is mentioned', () => {
    const forbidden = [
      /Ctrl\s*\+\s*N\b/, /Ctrl\s*\+\s*F(?!\d)/, /Alt\s*\+\s*[BIM]\b/,
      /\bDel(?:ete)?\b/i, /\bSpace\b/i, /مفتاح المسافة/, /شاشة الدفع المتعدد/,
      /F4[^\n.،]{0,25}(?:الكمية|كمية)/, /F3[^\n.،]{0,25}(?:العميل|عميل|الزبون)/, /F10[^\n.،]{0,25}(?:تعليق|تعلق)/,
      /F3\s*\+\s*F9/, /F9[^\n.،]{0,25}(?:تراجع|يتراجع)/, /F10\s*\(?Park/i,
      /(?:^|\s)[+\-−]\s*(?:لزيادة|لإنقاص|لتغيير)/m,
    ];
    for (const re of forbidden) assert.doesNotMatch(CONTENT_TEXT, re, `help text matches the removed key pattern ${re}`);
    assert.doesNotMatch(MODAL + SERVICE, /Ctrl\s*\+\s*N\b|Alt\s*\+\s*[BIM]\b/);
  });
});

describe('help center: content stays truthful and clean', () => {
  it('never mentions the developer console or its tools', () => {
    const forbidden = /root|لوحة المطور|مطور النظام|developer|factory\s*reset|تصفير شامل|تفعيل الميزات|تبويب فحص النظام|تصدير شامل/i;
    for (const [name, text] of [['content', CONTENT_TEXT], ['modal', MODAL], ['service', SERVICE]]) {
      assert.doesNotMatch(text, forbidden, `${name} mentions a developer-only tool`);
    }
  });

  it('has no emoji, no hex colour, no palette class and no pixel text size', () => {
    const emoji = /[\p{Extended_Pictographic}\uFE0F]/u;
    for (const [name, text] of [['content', CONTENT], ['modal', MODAL], ['service', SERVICE]]) {
      assert.doesNotMatch(text, emoji, `${name} contains an emoji`);
    }
    assert.doesNotMatch(MODAL, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/, 'hex colour in the modal');
    assert.doesNotMatch(
      MODAL,
      /\b(?:bg|text|border|ring|from|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/,
      'palette class in the modal'
    );
    assert.doesNotMatch(MODAL, /text-\[\d+px\]/, 'arbitrary pixel text size');
  });

  it('every guide has steps, a tip, unique step titles and a place in the side menu', () => {
    const ids = new Set();
    for (const a of HELP_ARTICLES) {
      assert.ok(!ids.has(a.id), `duplicate guide ${a.id}`);
      ids.add(a.id);
      assert.ok(a.steps.length >= 3, `${a.id} has too few steps`);
      assert.ok(a.goldenRule.trim().length > 0 && a.summary.trim().length > 0);
      assert.equal(new Set(a.steps.map((s) => s.title)).size, a.steps.length, `${a.id} has duplicate step titles`);
      assert.ok(MODAL.includes(`id: '${a.sectionId}'`), `${a.sectionId} is missing from the side menu`);
    }
    assert.equal(new Set(FAQS.map((f) => f.id)).size, FAQS.length);
  });

  it('covers the daily-use topics of a supermarket', () => {
    for (const topic of [
      'باركود الفاتورة', 'مرتجع حر بدون فاتورة', 'إجمالي الخصم', 'الحساب الرئيسي', 'فتح وردية', 'تقفيل اليومية',
      'خذ نسخة احتياطية', 'الرقم السري', 'استيراد بضاعة من شيت إكسل', 'دفتر النواقص', 'عمل باركود تلقائي للأصناف بدون كود',
      'فترة التنبيه', 'قوة نبضة فتح الدرج', 'فحص القارئ', 'الفواتير المعلقة', 'على الحساب بالكامل', 'طباعة استيكرات الباركود',
    ]) {
      assert.ok(CONTENT_TEXT.includes(topic), `missing topic: ${topic}`);
    }
    for (const ms of ['10', '20', '30', '40', '60', '100']) assert.ok(CONTENT_TEXT.includes(ms));
  });

  it('every quoted screen or button name exists in the app', () => {
    const appText = walk(SRC)
      .filter((p) => !/helpContent\.ts$/.test(p))
      .map((p) => read(p))
      .join('\n');
    // Quoted words that are examples or states, not buttons or screens
    const notUi = new Set(['شاي', 'أرز', 'بالجرام', 'بالكيلوجرام', 'نقص']);
    const missing = [];
    for (const m of CONTENT_TEXT.matchAll(/«([^»]+)»/g)) {
      const name = m[1].trim();
      if (notUi.has(name)) continue;
      if (!appText.includes(name)) missing.push(name);
    }
    assert.deepEqual([...new Set(missing)], [], 'quoted names that do not appear anywhere in the app');

    // Screen and menu names the guides rely on, quoted or not: still real, still used
    const screens = [
      'المتابعة والتقارير', 'لوحة اليوم والوردية', 'تحليلات العملاء والديون', 'حساب الإيرادات والأرباح', 'حركة المخزن والتوالف',
      'حركات وجرد المخزن', 'تواريخ الصلاحية والدفعات', 'العملاء وحسابات الشكك', 'الأصناف والمخزن', 'فواتير الشراء والموردين',
      'سجل وفواتير البيع', 'دليل وحسابات الموردين', 'سجل فواتير الشراء والمردودات', 'دفتر النواقص والطلبيات',
      'إعدادات المحل والسيستم', 'إعدادات الطابعة والورق', 'بيانات المحل والفاتورة', 'النسخ الاحتياطي', 'الموظفون والصلاحيات',
      'المزيد من الأدوات', 'قائمة المستخدم', 'المحافظ وإنستاباي', 'خدمات وماكينات الدفع', 'أرصدة المحافظ والحسابات',
      'تنفيذ عملية (سحب / إيداع)', 'سجل العمليات والإيصالات', 'أرصدة وماكينات الدفع', 'تنفيذ عملية دفع جديدة', 'فاتورة شراء واستلام بضاعة',
    ];
    for (const name of screens) {
      assert.ok(appText.includes(name), `"${name}" is not a screen or menu name in the app`);
      assert.ok(CONTENT_TEXT.includes(name), `"${name}" is no longer referenced by a guide`);
    }
  });
});

describe('help center: search, access and navigation helpers', () => {
  it('normalises Arabic spelling variants and digits', () => {
    assert.equal(normalizeHelpText('  الآجل  المُرتجَع '), 'الاجل المرتجع');
    assert.equal(normalizeHelpText('إنستاباي ١٢'), 'انستاباي 12');
    assert.equal(normalizeHelpText('F9'), 'f9');
  });

  it('finds guides and questions whatever the spelling, and needs every word', () => {
    const hits = (q) => searchHelp(q, HELP_ARTICLES, FAQS);
    assert.ok(hits('الاجل').articles.some((r) => r.article.sectionId === 'customers'));
    assert.ok(hits('انستاباي').articles.some((r) => r.article.sectionId === 'wallets'));
    assert.ok(hits('f12').articles.some((r) => r.article.sectionId === 'payment'));
    assert.ok(hits('باركود الفاتورة').articles.some((r) => r.article.sectionId === 'sales'));
    assert.ok(hits('الكهرباء').faqs.some((f) => f.id === 'faq_power_outage'));
    assert.deepEqual(hits('zzzz qqqq'), { articles: [], faqs: [] });
    assert.ok(hits('نبضة الدرج').articles.length >= 1);
    assert.equal(hits('الدرج zzzz').articles.length, 0, 'every word must match');
    assert.equal(hits('   ').articles.length, HELP_ARTICLES.length, 'a blank query lists everything');
    const withSteps = hits('تفريغ').articles.find((r) => r.article.sectionId === 'pos');
    assert.ok(withSteps && withSteps.matchedSteps.some((s) => s.shortcut === 'F7'));
  });

  it('shows only the guides a user may read; admins and owners read all', () => {
    const none = () => false;
    assert.equal(isHelpSectionAllowed('faq', false, none), true);
    assert.equal(isHelpSectionAllowed('support', false, none), true);
    for (const a of HELP_ARTICLES) {
      assert.equal(isHelpSectionAllowed(a.sectionId, false, none), false, `${a.sectionId} must need a permission`);
      assert.equal(isHelpSectionAllowed(a.sectionId, true, none), true);
    }
    const cashier = (key) => ['pos.access', 'customers.view'].includes(key);
    assert.equal(isHelpSectionAllowed('pos', false, cashier), true);
    assert.equal(isHelpSectionAllowed('payment', false, cashier), true);
    assert.equal(isHelpSectionAllowed('customers', false, cashier), true);
    assert.equal(isHelpSectionAllowed('purchases', false, cashier), false);
    assert.equal(isHelpSectionAllowed('backup_security', false, cashier), false);
  });

  it('opens the right guide for a screen name and falls back safely', () => {
    const all = () => true;
    assert.equal(resolveHelpSection('pos', all), 'pos');
    assert.equal(resolveHelpSection('wallets', all), 'wallets');
    assert.equal(resolveHelpSection('dashboard', all), 'shifts');
    assert.equal(resolveHelpSection('settings', all), 'backup_security');
    assert.equal(resolveHelpSection('epay', all), 'wallets');
    assert.equal(resolveHelpSection('insurance', all), 'pos');
    assert.equal(resolveHelpSection(undefined, all), 'pos');
    assert.equal(resolveHelpSection('faq', all), 'faq');
    const onlyCustomers = (id) => id === 'customers' || id === 'faq' || id === 'support';
    assert.equal(resolveHelpSection('purchases', onlyCustomers), 'customers', 'first guide the user may read');
    assert.equal(resolveHelpSection('pos', () => false), 'faq');
  });
});

describe('help center: opening it from any screen', () => {
  beforeEach(() => {
    globalThis.window = new EventTarget();
  });

  it('dispatches the open event with the section, defaulting to the cashier guide', () => {
    const seen = [];
    globalThis.window.addEventListener('rafiq:open-help', (e) => seen.push(e.detail.section));
    openHelpCenter('products');
    openHelpCenter();
    assert.deepEqual(seen, ['products', 'pos']);
  });
});

describe('help center: modal behaviour guards', () => {
  it('closes on Esc, returns focus, keeps Tab inside, and does not close on a drag that ends outside', () => {
    assert.match(MODAL, /e\.key === 'Escape'/);
    assert.match(MODAL, /previous\?\.focus\?\.\(\)/);
    assert.match(MODAL, /e\.key !== 'Tab'/);
    assert.match(MODAL, /onMouseDown=\{\(e\) => \{\s*if \(e\.target === e\.currentTarget\) onClose\(\)/);
    assert.doesNotMatch(MODAL, /onClick=\{\(e\) => \{\s*if \(e\.target === e\.currentTarget\)/);
  });

  it('shows the support bundle button to admins only and never invents diagnostics', () => {
    assert.match(MODAL, /\{isAdmin \? \(\s*<AppButton/);
    assert.doesNotMatch(MODAL, /'RAFIQ-POS-HOST'|'v1\.0\.0'|'دائم'|متاح طوال الأسبوع/);
  });

  it('keeps accessible names and tap sizes on the controls', () => {
    assert.match(MODAL, /aria-expanded=\{isExpanded\}/);
    assert.match(MODAL, /aria-label="إغلاق"/);
    assert.match(MODAL, /aria-labelledby="help-center-title"/);
    assert.doesNotMatch(MODAL, /\bw-8 h-8 rounded-lg bg-white\/10/, 'the close button is a full-size target');
  });
});
