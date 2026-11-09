import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

// White on bg-warn is 3.9:1 and ink on it 4.5:1; ink on bg-warn-bright is 10.7:1, so every solid amber label uses the bright fill.
const SOLID_AMBER_WITH_LABEL = /(?<![-\w:])bg-warn(?![-\w/]).*?(?<![-\w:])text-(?:white|ink)(?![-\w/])|(?<![-\w:])text-(?:white|ink)(?![-\w/]).*?(?<![-\w:])bg-warn(?![-\w/])/;

// Owned by the motion engineers while this sweep ran; drop the entries once their amber badges follow the same rule.
const DEFERRED = new Set(['components/NotificationCenter.tsx', 'views/DashboardView.tsx']);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = dir + name;
    return statSync(p).isDirectory() ? walk(p + '/') : /\.tsx?$/.test(name) ? [p] : [];
  });

const AMBER_SELECTED = [
  'components/SegmentedTabs.tsx',
  'components/QuickShortageModal.tsx',
  'views/purchases/ShortagesTab.tsx',
  'components/DataQualityAuditModal.tsx',
  'components/LicenseModal.tsx',
  'components/SpecializedPharmacyReportsModal.tsx',
  'components/ReturnModal.tsx',
  'components/DuePatientsModal.tsx',
  'views/customers/PatientProfileModal.tsx',
  'views/pos/PosCategoriesPanel.tsx',
  'views/pos/FloorTablesModal.tsx',
  'views/pos/DrugAlternativesDrawer.tsx',
  'views/pos/PosChronicDispenseModal.tsx',
  'views/pos/PosFooterBar.tsx',
  'views/pos/PosCartCheckoutBar.tsx',
  'views/SalesHistoryView.tsx',
];

describe('amber (warn) selected states and badges', () => {
  it('no solid bg-warn carries a white or ink label anywhere in the app', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      if (DEFERRED.has(file.slice(SRC.length))) continue;
      const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
      lines.forEach((line, i) => {
        if (SOLID_AMBER_WITH_LABEL.test(line)) offenders.push(`${file.slice(SRC.length)}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, [], 'use bg-warn-bright text-ink (with the dark: pair) for solid amber labels');
  });

  it('the covered files use the bright amber fill with ink text and keep a dark: pair', () => {
    for (const f of AMBER_SELECTED) {
      const src = read(f);
      assert.match(src, /bg-warn-bright\b[^'"`\n]*\btext-ink\b|\btext-ink\b[^'"`\n]*\bbg-warn-bright\b/, `${f}: bright amber fill with ink text`);
      assert.match(src, /dark:(?:bg-warn-(?:bright|dark-soft)|text-warn-bright|text-surface-dark)/, `${f}: dark pair`);
    }
  });

  it('segmented warn tone, the urgent button and the pending pill share the same light fill', () => {
    assert.match(read('components/SegmentedTabs.tsx'), /warn: 'bg-warn-bright dark:bg-warn-dark-soft text-ink dark:text-warn-bright /);
    assert.match(read('components/QuickShortageModal.tsx'), /'bg-warn-bright text-ink dark:bg-warn-dark-soft dark:text-warn-bright /);
    assert.match(read('views/purchases/ShortagesTab.tsx'), /id: 'pending'[^\n]*activeClass: 'bg-warn-bright text-ink dark:bg-warn-bright dark:text-surface-dark'/);
  });

  it('idle amber controls keep a readable hover label in light (ink, not warn on warn-soft 3.7:1)', () => {
    assert.match(read('components/SegmentedTabs.tsx'), /warn: 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-warn-bright /);
    const urgent = read('components/QuickShortageModal.tsx');
    assert.doesNotMatch(urgent, /(?<![-\w:])hover:text-warn(?![-\w])/);
    assert.match(urgent, /bg-danger text-white dark:bg-danger-dark-soft/);
  });
});
