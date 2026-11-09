import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

const listTsx = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsx(full);
    return full.endsWith('.tsx') ? [relative(SRC, full).split('\\').join('/')] : [];
  });

const importPath = (file, target) => {
  const rel = relative(dirname(join(SRC, file)), join(SRC, target)).split('\\').join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
};

const countOf = (text, needle) => text.split(needle).length - 1;

// panel: a useMotionPanel container (entrance fade+slide of the swapped children).
// height: a MotionHeight region (smooth height glide when the content size changes).
// wrapped: the body is `<MotionHeight ...><div {...panel}>`, i.e. both primitives on the same scroll body.
const SITES = [
  // Tabs / modes inside modals: entrance + height
  { file: 'components/ShiftModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/UserManagerModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/ReturnModal.tsx', panel: true, height: true, wrapped: true, staticBar: 'role="tablist"' },
  { file: 'components/QuickFastItemModal.tsx', panel: true, height: true },
  { file: 'views/customers/PatientProfileModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/RecipeManagerModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'views/pos/DeliveryCommandModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/DrugReferenceImportModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/ExpiryReturnsModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/ExcelImportModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'views/customers/CustomerImportExcelModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/GuidedTourModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/DailyClosingModal.tsx', panel: true, height: true, staticBar: 'role="tablist"' },
  // Fixed-size modals: only the entrance (the height never changes)
  { file: 'components/HelpCenterModal.tsx', panel: true, height: false },
  { file: 'components/FirstRunWizardModal.tsx', panel: true, height: false },
  { file: 'components/SpecializedPharmacyReportsModal.tsx', panel: true, height: false },
  { file: 'views/products/BulkPriceAdjustmentModal.tsx', panel: true, height: false },
  { file: 'views/pos/FloorTablesModal.tsx', panel: true, height: false },
  // Reveal blocks / banners / mode forms that change the size of a content-sized region: height only
  { file: 'components/MigrationWizardModal.tsx', panel: false, height: true },
  { file: 'views/customers/CustomerPaymentModal.tsx', panel: true, height: true },
  { file: 'views/purchases/SupplierPaymentModal.tsx', panel: true, height: true },
  { file: 'components/ExpenseModal.tsx', panel: false, height: true },
  { file: 'components/StockAdjustmentModal.tsx', panel: false, height: true },
  { file: 'components/QuickShortageModal.tsx', panel: false, height: true },
  { file: 'components/BarcodeScannerSettingsModal.tsx', panel: false, height: true },
  { file: 'components/QuickItemFormParts.tsx', panel: false, height: true },
  { file: 'views/products/ProductFormModal.tsx', panel: true, height: true },
  { file: 'views/purchases/NewPurchaseTab.tsx', panel: true, height: true },
  { file: 'views/root/RootFeaturesPage.tsx', panel: false, height: true },
  { file: 'views/settings/StoreProfileTab.tsx', panel: false, height: true },
  { file: 'views/settings/SalesPoliciesTab.tsx', panel: false, height: true },
  { file: 'views/settings/settingsParts.tsx', panel: false, height: true },
  // Added by the consistency audit: filter tabs and result toggles inside dialogs that resized or swapped instantly
  { file: 'components/KeyboardShortcutsModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'views/purchases/SupplierStatementModal.tsx', panel: true, height: true, wrapped: true },
  { file: 'components/CategoryIconPickerModal.tsx', panel: true, height: true },
  { file: 'components/CertifiedHardwareModal.tsx', panel: true, height: true },
  { file: 'components/payment/CustomerPicker.tsx', panel: true, height: false },
  { file: 'components/SearchBenchmarkModal.tsx', panel: false, height: true },
  { file: 'components/DatabaseRecoveryModal.tsx', panel: false, height: true },
  // Pages that already had the entrance; their funding modals gained the height glide
  { file: 'views/wallets/WalletsView.tsx', panel: true, height: true },
  { file: 'views/epay/EpayView.tsx', panel: true, height: true },
];

describe('motion coverage: every site that swaps or reveals different-sized content uses the primitives', () => {
  for (const site of SITES) {
    describe(site.file, () => {
      const text = read(site.file);

      if (site.height) {
        it('imports MotionHeight from components/MotionHeight and balances every region', () => {
          assert.ok(
            text.includes(`import MotionHeight from '${importPath(site.file, 'components/MotionHeight')}';`),
            'missing the MotionHeight import'
          );
          assert.ok(existsSync(join(SRC, 'components/MotionHeight.tsx')));
          const opens = countOf(text, '<MotionHeight');
          assert.ok(opens >= 1, 'no <MotionHeight> region');
          assert.equal(countOf(text, '</MotionHeight>'), opens, 'unbalanced <MotionHeight> tags');
        });
      } else {
        it('does not use MotionHeight (fixed-size container)', () => {
          assert.equal(countOf(text, '<MotionHeight'), 0);
        });
      }

      if (site.panel) {
        it('imports useMotionPanel from hooks/useMotionPanel and spreads it on the swap container', () => {
          assert.ok(
            text.includes(`import { useMotionPanel } from '${importPath(site.file, 'hooks/useMotionPanel')}';`),
            'missing the useMotionPanel import'
          );
          const match = /const (\w+) = useMotionPanel\(/.exec(text);
          assert.ok(match, 'useMotionPanel is never called');
          assert.ok(text.includes(`{...${match[1]}}`), `the ${match[1]} attributes are never spread on a container`);
        });

        it('calls the hook before any early return', () => {
          const hook = text.indexOf('useMotionPanel(');
          const early = text.search(/^\s*if \(!isOpen\) return null;/m);
          if (early !== -1) assert.ok(hook < early, 'useMotionPanel must run before `if (!isOpen) return null`');
        });
      } else {
        it('does not use useMotionPanel (no tab swap here)', () => {
          assert.equal(countOf(text, 'useMotionPanel('), 0);
        });
      }

      if (site.wrapped) {
        it('puts the entrance container directly inside the MotionHeight body', () => {
          assert.match(text, /<MotionHeight className="[^"]*">\s*<div \{\.\.\.\w+\}/);
        });
      }

      if (site.staticBar) {
        it('keeps the tab bar still while the panel below it animates', () => {
          const at = text.indexOf(site.staticBar);
          assert.ok(at !== -1);
          assert.ok(text.slice(at, at + 200).includes('motion-static'), 'the tab bar must carry motion-static');
        });
      }

      it('does not animate sizes with its own CSS', () => {
        assert.doesNotMatch(text, /transition-\[(max-)?height\]|transition-height|transition-\[(max-)?h/);
      });
    });
  }
});

describe('motion coverage: regression guard for tab and mode state', () => {
  const TAB_STATE = /const \[(active\w*|\w*[Tt]ab|\w*SubView|formMode|step|currentStepIndex|actionMode|mode|viewMode), set\w+\]|<SegmentedTabs/;
  const usesPrimitive = (text) => text.includes('useMotionPanel(') || text.includes('<MotionHeight') || text.includes('motion-panel');

  // Files that match the pattern but deliberately do not animate: the reason is the contract.
  const ALLOW = {
    'components/DataQualityAuditModal.tsx': 'activeFilter only filters an issue list; the modal is a fixed-size report',
    'components/QuickItemsManagerModal.tsx': 'fixed-height manager; its tabs filter the button grid and the unit switch has equal-sized panes (its optional-fields block uses ExtrasSection which already glides)',
    'components/analytics/DeadStockRadar.tsx': 'SegmentedTabs only re-filter the same list inside a fixed card',
    'views/LoginScreen.tsx': 'false positive (activeUsers); the login screen has no tab swap',
    'views/PosView.tsx': 'hot cashier path: scan, cart and checkout must never be delayed or resized by an animation; its modals animate on their own',
    'views/pos/DrugAlternativesDrawer.tsx': 'tier chips filter one list inside a fixed-width drawer',
    'views/pos/PosChronicDispenseModal.tsx': 'false positive (activeCustomerId)',
    'views/products/BatchesTab.tsx': 'SegmentedTabs only filter the batches table (table / long list)',
    'views/products/ProductsTable.tsx': 'false positive (activeMenu row menu); the table is a long list',
    'views/purchases/PurchasesInvoicesTab.tsx': 'false positive (activeMenu row menu); the table is a long list',
    'views/purchases/ShortagesTab.tsx': 'false positive (activeMenu) and table-heavy report scope switch (tables / long lists)',
    'views/purchases/SuppliersTab.tsx': 'false positive (activeMenu row menu); the table is a long list',
  };

  const flagged = listTsx(SRC).filter((file) => TAB_STATE.test(read(file)));

  it('finds the known tabbed files (the scan itself works)', () => {
    for (const must of ['components/ShiftModal.tsx', 'views/PurchasesView.tsx', 'components/HelpCenterModal.tsx']) {
      assert.ok(flagged.includes(must), `${must} should be detected as tabbed`);
    }
  });

  it('every file with tab, mode, step or SegmentedTabs state uses a motion primitive or is allow-listed with a reason', () => {
    const unanimated = flagged.filter((file) => !usesPrimitive(read(file)) && !(file in ALLOW));
    assert.deepEqual(unanimated, [], `add useMotionPanel / MotionHeight, or document why in ALLOW: ${unanimated.join(', ')}`);
  });

  it('the allow-list stays honest: every entry exists, still matches, has a reason, and does not already animate', () => {
    for (const [file, reason] of Object.entries(ALLOW)) {
      assert.ok(existsSync(join(SRC, file)), `${file} no longer exists, remove it from ALLOW`);
      assert.ok(reason.length > 20, `${file} needs a real reason`);
      const text = read(file);
      assert.ok(TAB_STATE.test(text), `${file} no longer matches the tab pattern, remove it from ALLOW`);
      if (file !== 'components/QuickItemsManagerModal.tsx') {
        assert.ok(!usesPrimitive(text), `${file} now uses a motion primitive, remove it from ALLOW`);
      }
    }
  });

  it('every listed site really exists', () => {
    for (const { file } of SITES) assert.ok(existsSync(join(SRC, file)), file);
  });
});

describe('motion coverage: layout safety of the primitives', () => {
  it('MotionHeight is only used where it cannot reshape a gap-based parent, i.e. never as a bare empty wrapper around a conditional sibling', () => {
    const offenders = listTsx(SRC).filter((file) => /<MotionHeight>\s*\{[^}]*&&\s*\(\s*<\/MotionHeight>/.test(read(file)));
    assert.deepEqual(offenders, []);
  });

  it('no MotionHeight wraps a table directly', () => {
    const offenders = listTsx(SRC).filter((file) => /<MotionHeight[^>]*>\s*<table/.test(read(file)));
    assert.deepEqual(offenders, []);
  });
});
