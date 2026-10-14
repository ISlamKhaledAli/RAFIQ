import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Store Type Features & First Startup Wizard Verification', () => {
  const storeTemplatesTsPath = path.resolve('src', 'constants', 'storeTemplates.ts');
  const storeTemplateServiceCsPath = path.resolve('..', 'desktop', 'Services', 'StoreTemplateService.cs');
  const securityServiceCsPath = path.resolve('..', 'desktop', 'Services', 'SecurityService.cs');
  const migrationRunnerCsPath = path.resolve('..', 'desktop', 'Database', 'MigrationRunner.cs');
  const databaseServiceCsPath = path.resolve('..', 'desktop', 'Services', 'DatabaseService.cs');
  const appTsxPath = path.resolve('src', 'App.tsx');
  const posCartCheckoutBarPath = path.resolve('src', 'views', 'pos', 'PosCartCheckoutBar.tsx');
  const systemDiagnosticsTabPath = path.resolve('src', 'views', 'settings', 'SystemDiagnosticsTab.tsx');

  it('1. Each store type template in frontend has tailored feature flags', () => {
    assert.ok(fs.existsSync(storeTemplatesTsPath), 'storeTemplates.ts must exist');
    const content = fs.readFileSync(storeTemplatesTsPath, 'utf8');

    // Clothing store: matrix variants ON, epay services OFF, digital wallets ON, scale OFF
    assert.ok(content.includes('clothing_apparel'), 'Must have clothing_apparel');
    assert.match(content, /id:\s*'clothing_apparel'[\s\S]*?feature_matrix_variants:\s*true/);
    assert.match(content, /id:\s*'clothing_apparel'[\s\S]*?feature_epay_services:\s*false/);
    assert.match(content, /id:\s*'clothing_apparel'[\s\S]*?feature_digital_wallets:\s*true/);
    assert.match(content, /id:\s*'clothing_apparel'[\s\S]*?feature_scale_weight:\s*false/);

    // Supermarket: scale ON, expiry ON, multi_units ON, epay ON, digital wallets ON, variants OFF
    assert.ok(content.includes('supermarket'), 'Must have supermarket');
    assert.match(content, /id:\s*'supermarket'[\s\S]*?feature_scale_weight:\s*true/);
    assert.match(content, /id:\s*'supermarket'[\s\S]*?feature_expiry_dates:\s*true/);
    assert.match(content, /id:\s*'supermarket'[\s\S]*?feature_multi_units:\s*true/);
    assert.match(content, /id:\s*'supermarket'[\s\S]*?feature_epay_services:\s*true/);
    assert.match(content, /id:\s*'supermarket'[\s\S]*?feature_digital_wallets:\s*true/);
    assert.match(content, /id:\s*'supermarket'[\s\S]*?feature_matrix_variants:\s*false/);

    // Phones/Electronics: epay ON, wallets ON, scale OFF
    assert.match(content, /id:\s*'phones_electronics'[\s\S]*?feature_epay_services:\s*true/);
    assert.match(content, /id:\s*'phones_electronics'[\s\S]*?feature_digital_wallets:\s*true/);
    assert.match(content, /id:\s*'phones_electronics'[\s\S]*?feature_scale_weight:\s*false/);

    // Produce/Butchery: scale ON, epay OFF, wallets ON
    assert.match(content, /id:\s*'produce_butchery'[\s\S]*?feature_scale_weight:\s*true/);
    assert.match(content, /id:\s*'produce_butchery'[\s\S]*?feature_epay_services:\s*false/);
    assert.match(content, /id:\s*'produce_butchery'[\s\S]*?feature_digital_wallets:\s*true/);
  });

  it('2. Backend StoreTemplateService defines matching tailored flags for all store presets', () => {
    assert.ok(fs.existsSync(storeTemplateServiceCsPath), 'StoreTemplateService.cs must exist');
    const content = fs.readFileSync(storeTemplateServiceCsPath, 'utf8');

    // allKnownFlags includes epay and wallets
    assert.ok(content.includes('"feature_epay_services"'), 'Must register feature_epay_services in allKnownFlags');
    assert.ok(content.includes('"feature_digital_wallets"'), 'Must register feature_digital_wallets in allKnownFlags');

    // Clothing preset in C#
    assert.ok(content.includes('t7.Id = "clothing_apparel"'), 'Must define clothing_apparel preset');
    assert.ok(content.includes('t7.FeatureFlags["feature_matrix_variants"] = true'), 'Clothing must enable variants');
    assert.ok(content.includes('t7.FeatureFlags["feature_epay_services"] = false'), 'Clothing must disable epay machine');
    assert.ok(content.includes('t7.FeatureFlags["feature_digital_wallets"] = true'), 'Clothing must enable digital wallets');
    assert.ok(content.includes('t7.FeatureFlags["feature_scale_weight"] = false'), 'Clothing must disable scale');

    // Supermarket preset in C#
    assert.ok(content.includes('t1.Id = "supermarket"'), 'Must define supermarket preset');
    assert.ok(content.includes('t1.FeatureFlags["feature_scale_weight"] = true'), 'Supermarket must enable scale');
    assert.ok(content.includes('t1.FeatureFlags["feature_epay_services"] = true'), 'Supermarket must enable epay machine');
    assert.ok(content.includes('t1.FeatureFlags["feature_digital_wallets"] = true'), 'Supermarket must enable digital wallets');
    assert.ok(content.includes('t1.FeatureFlags["feature_matrix_variants"] = false'), 'Supermarket must disable variants');
  });

  it('3. Clean database startup policy (Zero injected initial categories)', () => {
    const migrationContent = fs.readFileSync(migrationRunnerCsPath, 'utf8');
    const dbServiceContent = fs.readFileSync(databaseServiceCsPath, 'utf8');
    const tplServiceContent = fs.readFileSync(storeTemplateServiceCsPath, 'utf8');

    // MigrationRunner must NOT seed default categories
    assert.ok(!migrationContent.includes("INSERT OR IGNORE INTO categories"), 'MigrationRunner must not auto-seed categories');
    assert.ok(!migrationContent.includes('cat_dairy'), 'MigrationRunner must not auto-seed cat_dairy');
    assert.ok(!migrationContent.includes('cat_groceries'), 'MigrationRunner must not auto-seed cat_groceries');

    // FactoryReset must NOT seed categories
    assert.ok(!dbServiceContent.includes('INSERT INTO categories (id, name, display_order, is_active) VALUES (\'cat_'), 'FactoryReset must not seed mock categories');

    // ApplyTemplate purges unreferenced categories
    assert.ok(tplServiceContent.includes('DELETE FROM categories'), 'ApplyTemplate must purge unreferenced categories');
  });

  it('4. RBAC: Store owner (admin) cannot toggle feature flags; only root can by default', () => {
    const secContent = fs.readFileSync(securityServiceCsPath, 'utf8');

    // settings.features is reserved for isRoot
    assert.ok(secContent.includes('p["settings.features"] = isRoot;'), 'settings.features must default to isRoot only');
    assert.ok(!secContent.includes('p["settings.features"] = isAdmin;'), 'settings.features must NOT default to isAdmin');
  });

  it('5. Frontend views honor feature flags and RBAC controls', () => {
    const appContent = fs.readFileSync(appTsxPath, 'utf8');
    const posBarContent = fs.readFileSync(posCartCheckoutBarPath, 'utf8');
    const diagContent = fs.readFileSync(systemDiagnosticsTabPath, 'utf8');

    // Epay sidebar tab guarded by feature_epay_services
    assert.ok(appContent.includes("isEnabled('feature_epay_services')"), 'Sidebar epay tab must be guarded by feature flag');

    // Checkout bar wallets guarded by feature_digital_wallets
    assert.ok(posBarContent.includes("isEnabled('feature_digital_wallets')"), 'InstaPay/wallets in POS must be guarded by feature flag');

    // Diagnostics tab disables toggles if !canManageFeatures
    assert.ok(diagContent.includes('canManageFeatures'), 'Diagnostics tab must receive canManageFeatures');
    assert.ok(diagContent.includes('disabled={!canManageFeatures}'), 'Feature toggles must be disabled if user lacks permission');
    assert.ok(diagContent.includes('ShieldAlert'), 'Must show alert icon when features are read-only');
  });
});
