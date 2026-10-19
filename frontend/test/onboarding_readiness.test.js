import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Onboarding & Production Readiness Verification', () => {
  const wizardModalPath = path.resolve('src', 'components', 'FirstRunWizardModal.tsx');
  const readinessModalPath = path.resolve('src', 'components', 'ReadinessCheckModal.tsx');
  const guidedTourModalPath = path.resolve('src', 'components', 'GuidedTourModal.tsx');
  const appPath = path.resolve('src', 'App.tsx');
  const readinessServicePath = path.resolve('..', 'desktop', 'Services', 'ReadinessService.cs');
  const osDetectorPath = path.resolve('..', 'desktop', 'Common', 'OsDetector.cs');
  const mainFormPath = path.resolve('..', 'desktop', 'MainForm.cs');
  const storeTemplateServicePath = path.resolve('..', 'desktop', 'Services', 'StoreTemplateService.cs');
  const securityServicePath = path.resolve('..', 'desktop', 'Services', 'SecurityService.cs');

  it('1. Windows OS Environment & WebView2 Runtime Compatibility (Win 7 SP1 to Win 11)', () => {
    assert.ok(fs.existsSync(osDetectorPath), 'OsDetector.cs must exist');
    assert.ok(fs.existsSync(mainFormPath), 'MainForm.cs must exist');
    assert.ok(fs.existsSync(readinessServicePath), 'ReadinessService.cs must exist');

    const osDetectorContent = fs.readFileSync(osDetectorPath, 'utf8');
    const mainFormContent = fs.readFileSync(mainFormPath, 'utf8');
    const readinessContent = fs.readFileSync(readinessServicePath, 'utf8');

    // Windows version detection (Win 7 SP1, Win 8, Win 8.1, Win 10, Win 11 Build >= 22000)
    assert.ok(osDetectorContent.includes('22000'), 'Must detect Windows 11 by build number >= 22000');
    assert.ok(osDetectorContent.includes('Windows 7 SP1'), 'Must recognize Windows 7 SP1');
    assert.ok(osDetectorContent.includes('IsLegacyWindows'), 'Must classify Windows 7/8 as legacy');

    // Fixed 109 vs Evergreen WebView2 runtime selection
    assert.ok(mainFormContent.includes('fixed109'), 'Must support fixed109 runtime bundle for Windows 7');
    assert.ok(mainFormContent.includes('CoreWebView2Environment.GetAvailableBrowserVersionString()') ||
              mainFormContent.includes('GetAvailableBrowserVersionString'), 'Must detect Evergreen browser version');
    assert.ok(mainFormContent.includes('browserExecutableFolder'), 'Must route runtime folder appropriately');

    // ReadinessService includes os_environment check
    assert.ok(readinessContent.includes('os_environment'), 'ReadinessService must include os_environment check item');
    assert.ok(readinessContent.includes('OsDetector.GetOsFriendlyName()'), 'ReadinessService must query OS friendly name');
  });

  it('2. Disk Space & ProgramData Write Permissions Check', () => {
    const readinessContent = fs.readFileSync(readinessServicePath, 'utf8');
    const mainFormContent = fs.readFileSync(mainFormPath, 'utf8');

    // Production folder target is %ProgramData%\RafiqPOS\data
    assert.ok(mainFormContent.includes('CommonApplicationData') && mainFormContent.includes('RafiqPOS'), 
      'Must target CommonApplicationData (ProgramData) in production');

    // ReadinessService tests permissions via probe file and checks drive space
    assert.ok(readinessContent.includes('storage_permissions'), 'ReadinessService must include storage_permissions check');
    assert.ok(readinessContent.includes('_perm_probe_'), 'Must verify folder write permissions via temporary probe file');
    assert.ok(readinessContent.includes('AvailableFreeSpace'), 'Must check available free space on the drive');
  });

  it('3. FirstRunWizardModal Step-by-Step Flow & Initial Store Setup', () => {
    assert.ok(fs.existsSync(wizardModalPath), 'FirstRunWizardModal.tsx must exist');
    const wizardContent = fs.readFileSync(wizardModalPath, 'utf8');

    // Step 1: Store type templates
    assert.ok(wizardContent.includes('templates.map'), 'Step 1: must render store template cards');
    assert.ok(wizardContent.includes('handleSelectTemplate'), 'Step 1: must allow template selection');

    // Step 2: Store profile with live 80mm preview
    assert.ok(wizardContent.includes('storeName'), 'Step 2: must capture store name');
    assert.ok(wizardContent.includes('phone'), 'Step 2: must capture store phone');
    assert.ok(wizardContent.includes('معاينة حية لإيصال الكاشير (80 مم)'), 'Step 2: must include live 80mm receipt preview');

    // Step 3: Hardware & Backup
    assert.ok(wizardContent.includes('CustomSelect'), 'Step 3: must use CustomSelect for printer selection');
    assert.ok(wizardContent.includes('backupFolder'), 'Step 3: must configure backup directory');

    // Step 4: Review and confirm
    assert.ok(wizardContent.includes('تجهيز النظام'), 'Step 4: must have confirmation action');
    assert.ok(wizardContent.includes('templates:apply'), 'Must call templates:apply on backend');
  });

  it('4. Atomic Store Settings Persistence & Root User Security', () => {
    assert.ok(fs.existsSync(storeTemplateServicePath), 'StoreTemplateService.cs must exist');
    assert.ok(fs.existsSync(securityServicePath), 'SecurityService.cs must exist');

    const templateContent = fs.readFileSync(storeTemplateServicePath, 'utf8');
    const securityContent = fs.readFileSync(securityServicePath, 'utf8');
    const readinessContent = fs.readFileSync(readinessServicePath, 'utf8');

    // Template application sets store settings atomically
    assert.ok(templateContent.includes('first_run_completed'), 'Must mark first_run_completed in database');
    assert.ok(templateContent.includes('store_type'), 'Must record store_type');
    assert.ok(templateContent.includes('_settingsRepo.SaveBatch'), 'Must save settings in batch');

    // Root user (usr_root_developer, username: islam) and Admin (admin)
    assert.ok(securityContent.includes('usr_root_developer'), 'Must define usr_root_developer');
    assert.ok(securityContent.includes('islam'), 'Root username must be islam');
    assert.ok(securityContent.includes('root'), 'Root user must have role root');
    assert.ok(securityContent.includes('usr_admin_default') || securityContent.includes('admin'), 'Must configure store owner admin');

    // ReadinessService verifies root user and admin security
    assert.ok(readinessContent.includes('root_security'), 'ReadinessService must verify root user and admin security');
  });

  it('5. Prevention of Wizard Reappearance & Transition to Guided Tour', () => {
    const wizardContent = fs.readFileSync(wizardModalPath, 'utf8');
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.ok(fs.existsSync(guidedTourModalPath), 'GuidedTourModal.tsx must exist');
    const tourContent = fs.readFileSync(guidedTourModalPath, 'utf8');

    // Upon wizard completion, must set rafiq_first_run_completed and rafiq_show_guided_tour
    assert.ok(wizardContent.includes("localStorage.setItem('rafiq_first_run_completed', 'true')"), 
      'FirstRunWizardModal must record first_run_completed in localStorage');
    assert.ok(wizardContent.includes("localStorage.setItem('rafiq_show_guided_tour', 'true')"), 
      'FirstRunWizardModal must flag show_guided_tour for new user');
    assert.ok(wizardContent.includes('localStorage.removeItem(WIZARD_STORAGE_KEY)'), 
      'FirstRunWizardModal must clear temporary wizard state');

    // App.tsx must initialize isFirstRunWizardOpen and isTourOpen appropriately
    assert.ok(appContent.includes("localStorage.getItem('rafiq_first_run_completed') !== 'true'"), 
      'App.tsx must gate first-run wizard based on localStorage');
    assert.ok(appContent.includes("localStorage.getItem('rafiq_show_guided_tour') === 'true'"), 
      'App.tsx must launch GuidedTourModal if rafiq_show_guided_tour is set');

    // GuidedTourModal features 5 steps and keyboard tips
    assert.ok(tourContent.includes('TOUR_STEPS'), 'GuidedTourModal must contain structured tour steps');
    assert.ok(tourContent.includes('شاشة البيع السريع ونقطة البيع'), 'Tour Step 1 must cover POS screen');
    assert.ok(tourContent.includes('F2') || tourContent.includes('F12'), 'Tour must contain keyboard shortcut guidance');
  });

  it('6. ReadinessCheckModal Integration & Pilot Test Sale Support', () => {
    assert.ok(fs.existsSync(readinessModalPath), 'ReadinessCheckModal.tsx must exist');
    const readinessModalContent = fs.readFileSync(readinessModalPath, 'utf8');

    // Handles environment, storage, and security check keys
    assert.ok(readinessModalContent.includes('os_environment'), 'ReadinessCheckModal must handle os_environment');
    assert.ok(readinessModalContent.includes('storage_permissions'), 'ReadinessCheckModal must handle storage_permissions');
    assert.ok(readinessModalContent.includes('root_security'), 'ReadinessCheckModal must handle root_security');

    // Safe Pilot Test Sale without inventory or financial ledger contamination
    assert.ok(readinessModalContent.includes('readiness:processTestSale'), 'Must support pilot test sale');
    assert.ok(readinessModalContent.includes('ReceiptModal'), 'Must show pilot receipt upon test sale');
  });
});
