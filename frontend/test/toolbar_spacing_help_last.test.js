import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

describe('help buttons are the last action of their button group', () => {
  it('PurchasesInvoicesTab: help comes after "new purchase invoice"', () => {
    const src = read('views/purchases/PurchasesInvoicesTab.tsx');
    const create = src.indexOf('onClick={onOpenNewInvoice}');
    const help = src.indexOf("openHelpCenter('purchases')");
    assert.ok(create > 0 && help > 0);
    assert.ok(help > create, 'help must follow the create button in DOM order');
    const afterHelp = src.slice(help, help + 200);
    assert.match(afterHelp, /\/>\s*<\/div>/, 'help must close the action group');
  });

  it('ProductsView: help is the last element of the catalog header actions', () => {
    const src = read('views/ProductsView.tsx');
    const help = src.indexOf("openHelpCenter('products')");
    assert.ok(help > 0);
    for (const marker of ['setIsToolsDropdownOpen((prev) => !prev)', 'setShowCategoryModal(true)', 'onClick={openAddModal}']) {
      const at = src.indexOf(marker);
      assert.ok(at > 0 && at < help, marker + ' must come before the help button');
    }
    const afterHelp = src.slice(help, help + 700);
    assert.match(afterHelp, /<\/button>\s*<\/>\s*\) : null\}\s*<\/div>/, 'help must be the last element of the header actions');
  });

  it('SalesHistoryView: help stays alone in its card group (nothing follows it)', () => {
    const src = read('views/SalesHistoryView.tsx');
    const help = src.indexOf("openHelpCenter('sales')");
    assert.ok(help > 0);
    assert.match(src.slice(help, help + 400), /\/>\s*<\/div>\s*<\/div>/, 'help must close its group');
  });
});

describe('search box is separated from the filters by a larger horizontal gap', () => {
  const EXPECTATIONS = {
    'views/purchases/PurchasesInvoicesTab.tsx': ['flex-1 flex flex-wrap items-center gap-x-8 gap-y-3'],
    'views/wallets/WalletsView.tsx': [
      'flex items-center gap-x-8 gap-y-3 flex-wrap flex-1">\n                <SearchInput',
    ],
    'views/epay/EpayView.tsx': [
      'flex flex-wrap items-center gap-x-8 gap-y-2.5">\n                <SearchInput',
      'flex flex-wrap items-center justify-between gap-x-8 gap-y-3">\n                <SearchInput',
    ],
    'views/SalesHistoryView.tsx': ['justify-between gap-x-8 gap-y-2 sm:gap-y-2.5 shrink-0 shadow-xs'],
    'views/purchases/ShortagesTab.tsx': ['flex flex-wrap items-center gap-x-8 gap-y-2 flex-1 min-w-[17.5rem]'],
    'views/purchases/SuppliersTab.tsx': ['flex-1 flex items-center gap-x-8 gap-y-3'],
    'views/products/StockMovementsTab.tsx': ['flex items-center gap-x-8 gap-y-3 flex-wrap">\n          <SearchInput'],
    'views/products/BatchesTab.tsx': ['flex items-center gap-x-8 gap-y-3 flex-wrap'],
    'views/products/StorageLocationsModal.tsx': ['flex items-center gap-x-8 gap-y-3 w-full sm:w-auto flex-1'],
    'views/ProductsView.tsx': ['flex flex-wrap items-center gap-x-8 gap-y-3">\n            <SearchInput'],
    'views/CustomersView.tsx': ['justify-between gap-x-8 gap-y-2 flex-wrap sm:flex-nowrap'],
    'views/AuditLogView.tsx': ['p-2.5 flex items-center gap-x-8 gap-y-2 flex-wrap shrink-0'],
    'views/insurance/InsuranceContractsView.tsx': ['flex items-center gap-x-8 gap-y-3 w-full sm:w-auto'],
    'components/ControlledDrugsRegisterModal.tsx': ['flex items-center gap-x-8 gap-y-3 flex-wrap flex-1 min-w-[17.5rem]'],
    'components/BarcodeLabelModal.tsx': ['relative flex items-center gap-x-8 gap-y-2'],
    'components/DrugInteractionManagerModal.tsx': ['flex flex-wrap items-center gap-x-8 gap-y-3 flex-1 min-w-[17.5rem]'],
    'components/LowStockReportModal.tsx': ['justify-between gap-x-8 gap-y-3 print:hidden'],
    'components/DebtorsReportModal.tsx': ['justify-between gap-x-8 gap-y-3 print:hidden'],
    'components/ExpiryReturnsModal.tsx': ['flex items-center justify-between gap-x-8 gap-y-3 flex-wrap">\n                <SearchInput'],
    'components/CertifiedHardwareModal.tsx': ['justify-between gap-x-8 gap-y-3 shrink-0 select-none'],
    'components/PharmacyStocktakingModal.tsx': ['md:ms-5'],
  };

  for (const [file, snippets] of Object.entries(EXPECTATIONS)) {
    it(file, () => {
      const src = read(file);
      for (const snippet of snippets) {
        assert.ok(src.includes(snippet), file + ' must contain: ' + snippet);
      }
    });
  }
});
