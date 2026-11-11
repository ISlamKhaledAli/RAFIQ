import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (...p) => fs.readFileSync(path.resolve(...p), 'utf8').replace(/\r\n/g, '\n');
const app = read('src', 'App.tsx');
const viteConfig = read('vite.config.ts');

const LAZY_VIEWS = [
  ['EpayView', './views/epay/EpayView'],
  ['WalletsView', './views/wallets/WalletsView'],
  ['InsuranceContractsView', './views/insurance/InsuranceContractsView'],
  ['DashboardView', './views/DashboardView'],
  ['RevenueAnalyticsView', './views/analytics/RevenueAnalyticsView'],
  ['InventoryAnalyticsView', './views/analytics/InventoryAnalyticsView'],
  ['CustomerAnalyticsView', './views/analytics/CustomerAnalyticsView'],
  ['CustomersView', './views/CustomersView'],
  ['ProductsView', './views/ProductsView'],
  ['PurchasesView', './views/PurchasesView'],
  ['SalesHistoryView', './views/SalesHistoryView'],
  ['SettingsView', './views/SettingsView'],
  ['RootConsoleView', './views/root/RootConsoleView'],
];

describe('lazy-loaded screens', () => {
  it('keeps the cashier screen and the login in the entry bundle', () => {
    assert.match(app, /import \{ PosView \} from '\.\/views\/PosView';/);
    assert.match(app, /import \{ LoginScreen \} from '\.\/views\/LoginScreen';/);
  });

  for (const [name, file] of LAZY_VIEWS) {
    it(`${name} is imported on demand and never statically`, () => {
      assert.match(app, new RegExp(`const ${name} = lazyView(<[^>]*>)?\\(\\(\\) => import\\('${file.replace(/[./]/g, '\\$&')}'\\)`));
      assert.ok(!new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from '${file.replace(/[./]/g, '\\$&')}';`, 'm').test(app), 'no static value import');
    });
  }

  it('each lazy screen carries its own Arabic loading state inside a Suspense boundary', () => {
    assert.match(app, /<Suspense fallback=\{<RafiqLoadingState label="جاري فتح الشاشة\.\.\." sublabel="" \/>\}>/);
  });

  it('vite no longer pins the lazy screens into eagerly preloaded chunks', () => {
    for (const chunk of ['view-products', 'view-purchases', 'view-settings', 'view-insurance']) {
      assert.ok(!viteConfig.includes(chunk), `${chunk} manual chunk removed`);
    }
    assert.match(viteConfig, /return 'view-pos'/);
    assert.match(viteConfig, /target: 'chrome109'/);
  });
});
