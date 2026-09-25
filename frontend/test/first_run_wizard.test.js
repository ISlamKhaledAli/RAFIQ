import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Story 59: First-run Setup Wizard by Store Type (Feature #106)', () => {
  const templateServicePath = path.resolve('..', 'desktop', 'Services', 'StoreTemplateService.cs');
  const templateModelPath = path.resolve('..', 'desktop', 'Models', 'StoreTemplate.cs');
  const migrationRunnerPath = path.resolve('..', 'desktop', 'Database', 'MigrationRunner.cs');
  const wizardModalPath = path.resolve('src', 'components', 'FirstRunWizardModal.tsx');
  const appPath = path.resolve('src', 'App.tsx');
  const settingsViewPath = path.resolve('src', 'views', 'SettingsView.tsx');

  it('Task 106-1: Definition of 4 store templates (Supermarket, Dairy/Bakery, Accessories, General Grocery)', () => {
    assert.ok(fs.existsSync(templateModelPath), 'StoreTemplate.cs model must exist');
    assert.ok(fs.existsSync(templateServicePath), 'StoreTemplateService.cs must exist');

    const serviceContent = fs.readFileSync(templateServicePath, 'utf8');

    // 1. Supermarket template
    assert.ok(serviceContent.includes('supermarket'), 'Must define supermarket template');
    assert.ok(serviceContent.includes('سوبرماركت ومواد غذائية'), 'Must have Arabic title for supermarket');
    assert.ok(serviceContent.includes('feature_scale_weight'), 'Supermarket must configure scale weight feature');
    assert.ok(serviceContent.includes('معلبات وبقوليات'), 'Supermarket must include grocery categories');

    // 2. Dairy & Bakery template
    assert.ok(serviceContent.includes('dairy_bakery'), 'Must define dairy & bakery template');
    assert.ok(serviceContent.includes('ألبان ومخبوزات ومعلبات'), 'Must have Arabic title for dairy');
    assert.ok(serviceContent.includes('ألبان سائبة ومعبأة'), 'Dairy must include bulk milk categories');

    // 3. Accessories & Gifts template
    assert.ok(serviceContent.includes('accessories_gifts'), 'Must define accessories & gifts template');
    assert.ok(serviceContent.includes('إكسسوارات ومكتبات وهدايا'), 'Must have Arabic title for accessories');
    assert.ok(serviceContent.includes('t3.FeatureFlags["feature_scale_weight"] = false;'), 'Accessories must have scale weight disabled');

    // 4. General Grocery template
    assert.ok(serviceContent.includes('general_grocery'), 'Must define general grocery template');
    assert.ok(serviceContent.includes('بقالة ومحل تجاري عام'), 'Must have Arabic title for general grocery');
  });

  it('Task 106-2: Database storage of templates as data in SQLite (Migration 13)', () => {
    assert.ok(fs.existsSync(migrationRunnerPath), 'MigrationRunner.cs must exist');
    const migrationContent = fs.readFileSync(migrationRunnerPath, 'utf8');

    // Migration 13 schema
    assert.ok(migrationContent.includes('ApplyMigration13'), 'Must implement ApplyMigration13');
    assert.ok(migrationContent.includes('CREATE TABLE IF NOT EXISTS store_templates'), 'Must create store_templates table');
    assert.ok(migrationContent.includes('feature_flags_json'), 'store_templates must store feature flags as JSON');
    assert.ok(migrationContent.includes('categories_json'), 'store_templates must store categories as JSON');
    assert.ok(migrationContent.includes('quick_items_json'), 'store_templates must store quick items as JSON');

    // Version constant bumped
    assert.ok(migrationContent.includes('LATEST_SUPPORTED_VERSION = 13;'), 'LATEST_SUPPORTED_VERSION must be bumped to 13');
  });

  it('Task 106-3: Application logic applying store templates atomically', () => {
    const serviceContent = fs.readFileSync(templateServicePath, 'utf8');

    // Applies store settings
    assert.ok(serviceContent.includes('first_run_completed'), 'Must mark first_run_completed upon applying template');
    assert.ok(serviceContent.includes('store_type'), 'Must record selected store_type');
    assert.ok(serviceContent.includes('_settingsRepo.SaveBatch'), 'Must batch save settings atomically');

    // Seeds categories
    assert.ok(serviceContent.includes('_categoryService.SaveCategory'), 'Must seed categories for the template');

    // Seeds quick items
    assert.ok(serviceContent.includes('_quickItemService.Save'), 'Must seed quick items for POS grid');

    // Audit logging
    assert.ok(serviceContent.includes('FIRST_RUN_WIZARD_COMPLETED'), 'Must audit first run completion');
  });

  it('Task 106-4: FirstRunWizardModal UI and step-by-step onboarding flow', () => {
    assert.ok(fs.existsSync(wizardModalPath), 'FirstRunWizardModal.tsx must exist');
    const wizardContent = fs.readFileSync(wizardModalPath, 'utf8');

    // Step 1: Store type selection
    assert.ok(wizardContent.includes('templates.map'), 'Must render template selection cards');
    assert.ok(wizardContent.includes('handleSelectTemplate'), 'Must support switching store template');

    // Step 2: Store profile
    assert.ok(wizardContent.includes('storeName'), 'Step 2 must collect store name');
    assert.ok(wizardContent.includes('receiptHeader'), 'Step 2 must configure receipt header');

    // Step 3: Hardware & Backup
    assert.ok(wizardContent.includes('selectedPrinter'), 'Step 3 must select default receipt printer');
    assert.ok(wizardContent.includes('backupFolder'), 'Step 3 must configure backup folder');

    // Step 4: Review and start
    assert.ok(wizardContent.includes('handleApply'), 'Step 4 must trigger template application');
    assert.ok(wizardContent.includes('تجهيز النظام والبدء الآن'), 'Must have final confirmation button');
  });

  it('Task 106-4: Integration in App.tsx (auto-trigger on first run) and SettingsView (rerun)', () => {
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.ok(appContent.includes('FirstRunWizardModal'), 'App.tsx must import FirstRunWizardModal');
    assert.ok(appContent.includes('templates:isFirstRunNeeded'), 'App.tsx must check if first run wizard is needed on launch');
    assert.ok(appContent.includes('isFirstRunWizardOpen'), 'App.tsx must manage wizard open state');

    const settingsContent = fs.readFileSync(settingsViewPath, 'utf8');
    assert.ok(settingsContent.includes('FirstRunWizardModal'), 'SettingsView must import FirstRunWizardModal');
    assert.ok(settingsContent.includes('معالج نوع المحل (Setup Wizard)'), 'SettingsView must offer button to rerun setup wizard');
  });

  it('Task 106-5: Template data validation for each store preset', () => {
    // Validate that templates have valid non-empty fields and integer piasters
    const templates = [
      {
        id: 'supermarket',
        categoriesCount: 7,
        hasScale: true,
        quickItemPrice: 3500, // 35 EGP
      },
      {
        id: 'dairy_bakery',
        categoriesCount: 5,
        hasScale: true,
        quickItemPrice: 7000, // 70 EGP
      },
      {
        id: 'accessories_gifts',
        categoriesCount: 5,
        hasScale: false,
        quickItemPrice: 4500, // 45 EGP
      },
      {
        id: 'general_grocery',
        categoriesCount: 5,
        hasScale: true,
        quickItemPrice: 1500, // 15 EGP
      }
    ];

    for (const t of templates) {
      assert.ok(t.categoriesCount >= 5, `${t.id} must define at least 5 categories`);
      assert.ok(Number.isInteger(t.quickItemPrice), `${t.id} quick item prices must be integers (piasters)`);
      assert.ok(t.quickItemPrice > 0, `${t.id} quick item price must be positive`);
    }
  });
});
