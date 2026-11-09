import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The app is Arabic-only. This guard keeps English words from leaking back into visible text:
// whole-word English UI strings, English glosses after Arabic text and raw unit codes.
// Legitimate Latin items (brands, technical identifiers, keyboard keys) live in no_english_ui_text.allow.json.

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ALLOW = JSON.parse(readFileSync(fileURLToPath(new URL('./no_english_ui_text.allow.json', import.meta.url)), 'utf8'));
const ALLOWED_GLOSSES = new Set(Object.values(ALLOW.glossTokens).flat());

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = dir + name;
    if (statSync(full).isDirectory()) {
      if (name !== 'bridge') walk(full + '/', out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
};

const FILES = walk(SRC).map((full) => ({
  rel: full.slice(SRC.length),
  lines: readFileSync(full, 'utf8').replace(/\r\n/g, '\n').split('\n'),
}));

const isComment = (line) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line);

const ENGLISH_UI_WORDS =
  'Loading\\.\\.\\.|Loading|Save|Cancel|Delete|Search|Close|Error|Submit|Confirm|Edit|Add|Print|Back|Next|Yes|No|OK|Warning|Success|Failed|Refresh|Export|Import|Filter|Select|Details|Status|Settings';
const JSX_TEXT = new RegExp(`>\\s*(?:${ENGLISH_UI_WORDS})\\s*<`);
const VISIBLE_PROP = new RegExp(`\\b(?:placeholder|title|aria-label|alt|label|description|message)\\s*[=:]\\s*\\{?\\s*(['"\`])(?:${ENGLISH_UI_WORDS})\\1`);

// "Arabic text (English Words)": an untranslated gloss. Code expressions such as (foo.bar) never start with a capital.
const GLOSS = /[\u0600-\u06FF][^()\n]{0,40}\(([A-Z][A-Za-z]*(?:(?: ?[&/+,.-] ?| )[A-Za-z0-9é]+)*)\)/g;

// A raw unit code ("piece", "kg") printed instead of formatUnitArabic(...).
const RAW_UNIT_JSX = /\{[\w.?]+\.unit\}/;

const findEnglishUiWords = (line) => (JSX_TEXT.test(line) || VISIBLE_PROP.test(line) ? [line.trim()] : []);
const findGlosses = (line) => [...line.matchAll(GLOSS)].map((m) => m[1]).filter((g) => !ALLOWED_GLOSSES.has(g));
const findRawUnit = (line) => (RAW_UNIT_JSX.test(line) ? [line.trim()] : []);

const scan = (finder) => {
  const hits = [];
  for (const { rel, lines } of FILES) {
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      for (const hit of finder(line)) hits.push(`${rel}:${i + 1} ${hit}`);
    });
  }
  return hits;
};

describe('no English UI text: detectors catch the known leaks', () => {
  it('flags whole-word English labels', () => {
    assert.equal(findEnglishUiWords('<button>Save</button>').length, 1);
    assert.equal(findEnglishUiWords('<span> Loading... </span>').length, 1);
    assert.equal(findEnglishUiWords('<input placeholder="Search" />').length, 1);
    assert.equal(findEnglishUiWords("{ value: 'x', label: 'Cancel' }").length, 1);
    assert.equal(findEnglishUiWords('<button>حفظ</button>').length, 0);
  });

  it('flags English glosses but not allow-listed technical or brand tokens', () => {
    assert.deepEqual(findGlosses('جلسة المطور (Root)'), ['Root']);
    assert.deepEqual(findGlosses('الرسبي والتصنيع (Recipes / BOM)'), ['Recipes / BOM']);
    assert.deepEqual(findGlosses('فوري (Fawry)'), ['Fawry']);
    assert.deepEqual(findGlosses('بصمة (SHA-256)'), []);
    assert.deepEqual(findGlosses('إغلاق (Esc)'), []);
    assert.deepEqual(findGlosses('كود الصنف (SKU)'), []);
    assert.deepEqual(findGlosses('الرصيد (${formatMoney(x)})'), []);
  });

  it('flags a raw unit code printed in JSX', () => {
    assert.equal(findRawUnit('{qty} {item.unit}').length, 1);
    assert.equal(findRawUnit('{qty} {formatUnitArabic(item.unit)}').length, 0);
  });
});

describe('no English UI text: the source tree', () => {
  it('has no English-only labels, placeholders, titles or JSX text', () => {
    assert.deepEqual(scan(findEnglishUiWords), []);
  });

  it('has no untranslated English gloss after Arabic text (add legitimate ones to the allow-list)', () => {
    assert.deepEqual(scan(findGlosses), []);
  });

  it('never prints a raw stored unit code', () => {
    assert.deepEqual(scan(findRawUnit), []);
  });
});

describe('no English UI text: stock movements page', () => {
  const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

  for (const rel of ['views/products/StockMovementsTab.tsx', 'components/StockMovementsModal.tsx']) {
    it(`${rel} routes notes and type labels through the shared util`, () => {
      const src = read(rel);
      assert.match(src, /import \{[^}]*cleanMovementNote[^}]*\} from '(\.\.\/)+utils\/movementText'/);
      assert.match(src, /movementTypeLabel\(m\.movementType, m\.movementTypeArabic\)/);
      assert.ok(!/\{\s*m\.note\s*(\}|\|\|)/.test(src), 'raw m.note must not be rendered');
      assert.ok(!/title=\{m\.note\b/.test(src), 'raw m.note must not be used as a tooltip');
      assert.ok(!/movementTypeArabic\s*\|\|\s*m\.movementType/.test(src), 'raw movement code fallback');
    });
  }
});
