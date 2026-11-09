import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CATEGORY_GUIDE,
  CERTIFIED_DEVICES,
  CONNECTION_HINTS,
  CONNECTION_LABELS,
  HARDWARE_CATEGORIES,
  STATUS_LABELS,
  filterCertifiedDevices,
} from '../src/utils/certifiedHardware.ts';
import { DRAWER_PULSE_DEFAULT_MS, DRAWER_PULSE_PRESETS } from '../src/utils/drawerPulse.ts';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');
const modal = read('components/CertifiedHardwareModal.tsx');

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = dir + name;
    if (statSync(full).isDirectory()) walk(full + '/', out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
};
const UI_CORPUS = walk(SRC)
  .filter((f) => !f.endsWith('/utils/certifiedHardware.ts'))
  .map((f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n'))
  .join('\n');

const ARABIC = /[\u0600-\u06FF]/;
const blank = (v) => typeof v !== 'string' || v.trim() === '';
const allText = (d) => [d.brand, d.model, d.type, d.notes, ...d.setupSteps, ...d.specs.flatMap((s) => [s.label, s.value])];

// The models that existed in the guide before this audit: no model may be added without a real test.
const ORIGINAL_MODEL_IDS = [
  'xp_n160ii', 'bixolon_srp330', 'epson_tmt20', 'mini_pos_58', 'datalogic_qd2400', 'honeywell_1250g',
  'zebra_ds9208', 'symbol_ls2208', 'netum_wireless_2d', 'cash_drawer_standard', 'aclas_scale',
];

describe('certified hardware guide: every entry is complete', () => {
  it('has unique ids and no blank or placeholder value', () => {
    const ids = new Set();
    const models = new Set();
    for (const d of CERTIFIED_DEVICES) {
      assert.ok(!ids.has(d.id), `duplicate id ${d.id}`);
      ids.add(d.id);
      assert.ok(!models.has(d.model), `duplicate model ${d.model}`);
      models.add(d.model);
      for (const field of ['brand', 'model', 'type', 'notes']) assert.ok(!blank(d[field]), `${d.id}.${field}`);
      assert.ok(d.setupSteps.length >= 2, `${d.id} setup steps`);
      assert.ok(d.specs.length >= 1, `${d.id} specs`);
      for (const text of allText(d)) {
        assert.ok(!blank(text), `${d.id} has a blank value`);
        assert.doesNotMatch(text, /undefined|null|NaN|TODO|lorem|\bXXX\b|\?\?/i, `${d.id}: ${text}`);
      }
      assert.ok(d.connections.length >= 1, `${d.id} connection`);
      for (const c of d.connections) {
        assert.ok(CONNECTION_LABELS[c] && CONNECTION_HINTS[c], `${d.id}: unknown connection ${c}`);
      }
      assert.ok(STATUS_LABELS[d.status], `${d.id} status`);
      assert.ok(HARDWARE_CATEGORIES.includes(d.category), `${d.id} category`);
    }
  });

  it('shows a Windows result only for tried models and never for generic cards', () => {
    for (const d of CERTIFIED_DEVICES) {
      if (d.status === 'untested') assert.equal(d.windows, undefined, `${d.id} must not claim a Windows result`);
      else assert.ok(d.windows && typeof d.windows.win7 === 'boolean' && typeof d.windows.win10_11 === 'boolean', `${d.id} windows`);
    }
  });

  it('does not invent models: tried models are exactly the ones the guide already had', () => {
    const tried = CERTIFIED_DEVICES.filter((d) => d.status !== 'untested').map((d) => d.id).sort();
    assert.deepEqual(tried, [...ORIGINAL_MODEL_IDS].sort());
  });

  it('carries no unverifiable numbers: latency, guarantees, speed-ups or cut counts', () => {
    for (const d of CERTIFIED_DEVICES) {
      for (const text of allText(d)) {
        assert.doesNotMatch(text, /100\s*%|\d+\s*%|<\s*\d+\s*ms|مليون|ضمان|\$|EGP|ج\.م|جنيه/, `${d.id}: ${text}`);
      }
    }
  });

  it('has no English wording beyond brands, models, connections and technical identifiers', () => {
    const allowedLatin = /^[A-Za-z0-9 ./+\-()&,:×]+$/;
    for (const d of CERTIFIED_DEVICES) {
      for (const text of [d.type, d.notes, ...d.setupSteps]) {
        const english = text.match(/[A-Za-z][A-Za-z0-9\-/.+ ]*[A-Za-z0-9]/g) ?? [];
        for (const chunk of english) assert.ok(allowedLatin.test(chunk), `${d.id}: ${chunk}`);
      }
      assert.doesNotMatch(d.notes, /\bthe\b|\band\b|\bwith\b/i, d.id);
    }
  });
});

describe('certified hardware guide: categories match what Rafiq POS supports', () => {
  it('covers printers, labels, scanners, drawers, scales and power, each with a guide and a requirements card', () => {
    assert.deepEqual([...HARDWARE_CATEGORIES], ['printer', 'label', 'scanner', 'drawer', 'scale', 'power']);
    for (const c of HARDWARE_CATEGORIES) {
      const guide = CATEGORY_GUIDE[c];
      for (const field of ['label', 'supports', 'connects', 'settings']) assert.ok(!blank(guide[field]) && ARABIC.test(guide[field]), `${c}.${field}`);
      const entries = CERTIFIED_DEVICES.filter((d) => d.category === c);
      assert.ok(entries.length >= 1, `${c} has no entry`);
      assert.ok(entries.some((d) => d.status === 'untested'), `${c} needs a generic requirements card`);
    }
    assert.ok(CERTIFIED_DEVICES.some((d) => d.id === 'generic_kitchen_printer'));
  });

  it('untested cards are labelled and use the generic brand', () => {
    for (const d of CERTIFIED_DEVICES.filter((x) => x.status === 'untested')) {
      assert.equal(d.brand, 'متطلبات عامة');
      assert.match(d.notes, /لم تُجرّب|لم تجرّب|لم يُجرّب|توصية عامة/, d.id);
    }
    assert.equal(STATUS_LABELS.untested, 'غير مجرّب بعد');
  });

  it('scale labels use exactly the prefixes and layout the parser accepts', () => {
    const parser = read('utils/scaleBarcode.ts');
    for (const prefix of ['20', '21', '22', '99']) assert.ok(parser.includes(`prefix !== '${prefix}'`) || parser.includes(`'${prefix}'`), prefix);
    const guide = CATEGORY_GUIDE.scale.supports;
    assert.ok(guide.includes('20 أو 21 أو 22 أو 99') && guide.includes('13 رقماً') && guide.includes('5 أرقام'));
    const scale = CERTIFIED_DEVICES.find((d) => d.id === 'aclas_scale');
    assert.ok(scale.setupSteps.some((s) => s.includes('20 أو 21 أو 22 أو 99')));
    assert.ok(scale.specs.some((s) => s.value.includes('وليس السعر')), 'the price is not read from the label');
    assert.deepEqual(scale.connections, ['Label'], 'Rafiq has no serial or USB scale link');
    assert.doesNotMatch(read('utils/certifiedHardware.ts'), /Serial/);
  });

  it('drawer pulse and pin facts match the printer settings', () => {
    const guide = CATEGORY_GUIDE.drawer.supports;
    const ms = DRAWER_PULSE_PRESETS.map((p) => p.ms);
    assert.ok(guide.includes(`من ${Math.min(...ms)} إلى ${Math.max(...ms)} مللي ثانية`) && guide.includes(`الافتراضية ${DRAWER_PULSE_DEFAULT_MS}`));
    assert.ok(guide.includes('Pin 2') && guide.includes('Pin 5') && UI_CORPUS.includes('منفذ 1 (Pin 2'));
    const drawer = CERTIFIED_DEVICES.find((d) => d.id === 'cash_drawer_standard');
    assert.ok(drawer.specs.some((s) => s.value.includes(`${DRAWER_PULSE_DEFAULT_MS} مللي ثانية`)));
    assert.ok(!allText(drawer).some((t) => /ESC p|27,112/.test(t)), 'the old raw drawer command is not what the app sends');
  });

  it('label sizes and scanner timing match the settings screens', () => {
    const printerTab = read('views/settings/PrinterSettingsTab.tsx');
    const sizes = [...printerTab.matchAll(/value: '(\d+x\d+)', kind: 'roll'/g)].map((m) => m[1].replace('x', '×'));
    assert.ok(sizes.length >= 5);
    const label = CERTIFIED_DEVICES.find((d) => d.id === 'generic_label_printer');
    for (const size of sizes) assert.ok(label.specs[0].value.includes(size) && CATEGORY_GUIDE.label.supports.includes(size), size);
    assert.ok(printerTab.includes("value: 'a4_24'") && printerTab.includes("value: 'a4_40'"));
    const scannerSource = read('components/BarcodeScannerSettingsModal.tsx');
    assert.ok(scannerSource.includes('[45, 65, 80, 100]'));
    const scanner = CERTIFIED_DEVICES.find((d) => d.id === 'generic_barcode_scanner');
    assert.ok(scanner.specs.some((s) => s.value.includes('45 أو 65 أو 80 أو 100') && s.value.includes('65')));
  });

  it('every quoted setting name exists in the app', () => {
    let checked = 0;
    for (const d of CERTIFIED_DEVICES) {
      for (const text of [...d.setupSteps, d.notes]) {
        for (const m of text.matchAll(/«([^»]+)»/g)) {
          checked++;
          assert.ok(UI_CORPUS.includes(m[1]) || /Scan Options|Data Suffix|HID KEYBOARD EMULATION/.test(m[1]), `${d.id}: «${m[1]}»`);
        }
      }
    }
    for (const guide of Object.values(CATEGORY_GUIDE)) {
      for (const m of guide.settings.matchAll(/«([^»]+)»/g)) assert.ok(UI_CORPUS.includes(m[1]), m[1]);
    }
    assert.ok(checked >= 15, `quoted names checked: ${checked}`);
  });

  it('settings paths name real screens', () => {
    for (const phrase of ['إعدادات المحل والسيستم', 'إعدادات الطابعة والورق', 'الماسح والحماية', 'الميزات والأنشطة', 'خيارات وأتمتة الكاشير والدرج', 'طابعة استيكرات الباركود والأسعار']) {
      assert.ok(UI_CORPUS.includes(phrase), phrase);
    }
    assert.ok(Object.values(CATEGORY_GUIDE).some((g) => g.settings.includes('F8')));
  });
});

describe('certified hardware guide: search and category filter', () => {
  it('filters by category and by model, brand, type or notes, case-insensitively', () => {
    assert.equal(filterCertifiedDevices(CERTIFIED_DEVICES, 'all', '').length, CERTIFIED_DEVICES.length);
    const printers = filterCertifiedDevices(CERTIFIED_DEVICES, 'printer', '');
    assert.ok(printers.length >= 5 && printers.every((d) => d.category === 'printer'));
    assert.deepEqual(filterCertifiedDevices(CERTIFIED_DEVICES, 'all', ' ZEBRA ').map((d) => d.id).sort(), ['symbol_ls2208', 'zebra_ds9208']);
    assert.equal(filterCertifiedDevices(CERTIFIED_DEVICES, 'drawer', 'xprinter').length, 0);
    assert.equal(filterCertifiedDevices(CERTIFIED_DEVICES, 'all', 'غير موجود إطلاقاً').length, 0);
    assert.ok(filterCertifiedDevices(CERTIFIED_DEVICES, 'all', 'استيكر').some((d) => d.category === 'label'));
  });
});

describe('certified hardware guide: layout and motion', () => {
  it('uses the shared toolbar pattern: md search with its button, segmented filters, sticky header and pinned footer', () => {
    assert.match(modal, /<SearchInput\s+size="md"/);
    assert.doesNotMatch(modal, /searchButton=\{false\}/);
    assert.match(modal, /<SegmentedTabs[^>]*size="compact"/);
    assert.ok(modal.includes('px-5 py-4 bg-canvas dark:bg-surface-dark border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-x-8 gap-y-3 shrink-0 select-none'));
    assert.ok(modal.includes('flex-1 px-5 py-4 overflow-y-auto'));
    assert.ok(modal.includes('px-5 py-4 bg-canvas dark:bg-surface-dark border-t'));
    assert.match(modal, /max-w-5xl h-\[92vh\]/);
    assert.match(modal, /grid grid-cols-1 lg:grid-cols-2 gap-4 items-start/);
  });

  it('is readable: no tiny text, tokens only, dark pairs, wrapping text', () => {
    assert.doesNotMatch(modal, /text-\[\d+px\]|text-micro|\btruncate\b/);
    assert.doesNotMatch(modal, /#[0-9a-fA-F]{3,8}\b|\b(?:slate|gray|zinc|neutral|red|green|blue)-\d{2,3}\b/);
    assert.match(modal, /break-words/);
    assert.match(modal, /bg-surface dark:bg-surface-dark/);
  });

  it('switches categories with useMotionPanel and reveals the steps inside MotionHeight', () => {
    assert.match(modal, /import \{ useMotionPanel \} from '\.\.\/hooks\/useMotionPanel';/);
    assert.match(modal, /import MotionHeight from '\.\/MotionHeight';/);
    assert.match(modal, /const listPanel = useMotionPanel\(activeCategory\);/);
    assert.match(modal, /<div \{\.\.\.listPanel\}/);
    assert.ok(modal.split('<MotionHeight>').length === 2 && modal.split('</MotionHeight>').length === 2);
    assert.ok(modal.indexOf('useMotionPanel(activeCategory)') < modal.indexOf('if (!isOpen) return null;'));
    for (const line of modal.split('\n')) {
      if (/\{\.\.\.listPanel\}|<MotionHeight/.test(line)) assert.doesNotMatch(line, /transition-all|\bduration-\d+/);
    }
  });

  it('keeps the steps in the printed sheet even when a card is collapsed', () => {
    assert.match(modal, /hidden print:block/);
  });

  it('shows no empty value: every field is guarded or required, and the old fabricated labels are gone', () => {
    assert.doesNotMatch(modal, /latency|arabicSupport|testResults|recommendedSettings|ضمان التوافق|متوافق 100/);
    assert.match(modal, /device\.windows &&/);
  });
});
