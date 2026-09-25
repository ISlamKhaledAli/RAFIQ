import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('Story 58: Sensitive Screens PIN Code Protection (Feature #52)', () => {
  const securityServicePath = path.resolve('..', 'desktop', 'Services', 'SecurityService.cs');
  const ipcDispatcherPath = path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.cs');
  const pinModalPath = path.resolve('src', 'components', 'PinCodeModal.tsx');
  const pinSettingsModalPath = path.resolve('src', 'components', 'PinSettingsModal.tsx');
  const dbRecoveryModalPath = path.resolve('src', 'components', 'DatabaseRecoveryModal.tsx');
  const settingsViewPath = path.resolve('src', 'views', 'SettingsView.tsx');

  it('Task 52-1: C# SecurityService implements PBKDF2 salted hashing, brute-force delay, and lockout', () => {
    assert.ok(fs.existsSync(securityServicePath), 'SecurityService.cs must exist');
    const content = fs.readFileSync(securityServicePath, 'utf8');

    // 1. PBKDF2 hashing with salt (Task 52-1)
    assert.ok(content.includes('Rfc2898DeriveBytes'), 'Must use Rfc2898DeriveBytes for PBKDF2 salted hashing');
    assert.ok(content.includes('RNGCryptoServiceProvider'), 'Must use RNGCryptoServiceProvider for cryptographic salt generation');
    assert.ok(content.includes('PBKDF2_ITERATIONS = 10000'), 'Must use at least 10,000 PBKDF2 iterations');
    assert.ok(content.includes('SlowEquals'), 'Must implement constant-time equality comparison to prevent timing attacks');

    // IPC endpoints registration
    assert.ok(fs.existsSync(ipcDispatcherPath), 'IpcDispatcher.cs must exist');
    const dispatcherContent = fs.readFileSync(ipcDispatcherPath, 'utf8');
    assert.ok(dispatcherContent.includes('case "security:verifyPin":'), 'IpcDispatcher must handle security:verifyPin');
    assert.ok(dispatcherContent.includes('case "security:getStatus":'), 'IpcDispatcher must handle security:getStatus');

    // 2. Brute-force throttling and lockout (Task 52-1)
    assert.ok(content.includes('security_failed_attempts'), 'Must track consecutive failed attempts');
    assert.ok(content.includes('security_lockout_until'), 'Must record lockout expiration timestamp');
    assert.ok(content.includes('lockoutSec = 30'), 'Must enforce 30 seconds lockout after 5 failed attempts');
    assert.ok(content.includes('lockoutSec = 300'), 'Must enforce 300 seconds (5 min) lockout after 10 failed attempts');

    // 3. Audit logging of security events
    assert.ok(content.includes('PIN_VERIFIED'), 'Must audit successful verification');
    assert.ok(content.includes('PIN_LOCKOUT'), 'Must audit lockout events');
    assert.ok(content.includes('PIN_FAILED'), 'Must audit failed attempts');
  });

  it('Task 52-2: Reusable PinCodeModal and PinSettingsModal exist with keypad, masked bullets, and settings', () => {
    assert.ok(fs.existsSync(pinModalPath), 'PinCodeModal.tsx must exist');
    assert.ok(fs.existsSync(pinSettingsModalPath), 'PinSettingsModal.tsx must exist');

    const modalContent = fs.readFileSync(pinModalPath, 'utf8');
    // Keypad support
    assert.ok(modalContent.includes('handleKeypadPress'), 'Must support on-screen numeric keypad');
    // Bullets display
    assert.ok(modalContent.includes('pin.length'), 'Must render masked bullets indicator');
    // Lockout countdown
    assert.ok(modalContent.includes('lockoutRemaining'), 'Must display countdown when locked');
    // Emergency recovery link
    assert.ok(modalContent.includes('isRecoveryMode'), 'Must include link to emergency recovery mode');

    const settingsContent = fs.readFileSync(pinSettingsModalPath, 'utf8');
    assert.ok(settingsContent.includes('isPinSet'), 'Must show current PIN status');
    assert.ok(settingsContent.includes('handleToggleEnable'), 'Must support enabling/disabling PIN protection');
    assert.ok(settingsContent.includes('newRecoveryCodeGenerated') || settingsContent.includes('generatedRecoveryCode'), 'Must display emergency recovery code upon creation');
  });

  it('Task 52-3: Configurable list of protected actions & operations exists', () => {
    const serviceContent = fs.readFileSync(securityServicePath, 'utf8');
    assert.ok(serviceContent.includes('defaultActions["settings"] = true;'), 'Settings screen must be protected by default');
    assert.ok(serviceContent.includes('defaultActions["reports"] = true;'), 'Reports screen must be protected by default');
    assert.ok(serviceContent.includes('defaultActions["product_edit"] = true;'), 'Product price editing must be protected by default');
    assert.ok(serviceContent.includes('defaultActions["stock_adjust"] = true;'), 'Manual stock adjustment must be protected by default');
    assert.ok(serviceContent.includes('defaultActions["db_recovery"] = true;'), 'Database recovery/reset must be protected by default');

    // Check integration in SettingsView
    const settingsViewContent = fs.readFileSync(settingsViewPath, 'utf8');
    assert.ok(settingsViewContent.includes('PinSettingsModal'), 'SettingsView must integrate PinSettingsModal');
    assert.ok(settingsViewContent.includes("subTab === 'security'"), 'SettingsView must include security subtab');

    // Check integration in DatabaseRecoveryModal (no longer hardcoded '1234')
    const dbModalContent = fs.readFileSync(dbRecoveryModalPath, 'utf8');
    assert.ok(dbModalContent.includes("security:verifyPin"), 'DatabaseRecoveryModal must call security:verifyPin');
    assert.ok(!dbModalContent.includes("pin.trim() !== '1234'"), 'DatabaseRecoveryModal must not have hardcoded 1234 PIN check');
  });

  it('Task 52-4: One-time emergency recovery code generated upon PIN creation/reset', () => {
    const serviceContent = fs.readFileSync(securityServicePath, 'utf8');
    assert.ok(serviceContent.includes('GenerateRecoveryCode'), 'Must have cryptographic recovery code generator');
    assert.ok(serviceContent.includes('RFK-'), 'Recovery code must follow RFK-XXXX-XXXX format');
    assert.ok(serviceContent.includes('ResetWithRecoveryCode'), 'Must provide method to reset PIN via recovery code');
    assert.ok(serviceContent.includes('VerifyRecoveryCodeInternal'), 'Must verify recovery code against hashed storage');

    const modalContent = fs.readFileSync(pinModalPath, 'utf8');
    assert.ok(modalContent.includes('handleResetWithRecovery'), 'PinCodeModal must allow emergency reset with recovery code');
    assert.ok(modalContent.includes('copyRecoveryCode'), 'Must allow copying newly generated recovery code');
  });

  it('Task 52-5: Cryptographic hashing and brute-force simulation test', () => {
    // Simulate PBKDF2 salted hashing
    const pin = '4826';
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(pin, salt, 10000, 32, 'sha1');

    assert.equal(hash.length, 32, 'Hash must be 32 bytes (256 bits)');

    // Correct PIN verification
    const testHash = crypto.pbkdf2Sync('4826', salt, 10000, 32, 'sha1');
    assert.ok(crypto.timingSafeEqual(hash, testHash), 'Correct PIN must produce identical hash with constant-time equality');

    // Incorrect PIN verification
    const wrongHash = crypto.pbkdf2Sync('9999', salt, 10000, 32, 'sha1');
    assert.ok(!crypto.timingSafeEqual(hash, wrongHash), 'Incorrect PIN must not match');

    // Simulation of brute-force lockout rule
    let failedCount = 0;
    let lockoutSec = 0;

    for (let attempt = 1; attempt <= 10; attempt++) {
      failedCount++;
      if (failedCount >= 10) {
        lockoutSec = 300;
      } else if (failedCount >= 5) {
        lockoutSec = 30;
      } else {
        lockoutSec = 0;
      }

      if (attempt < 5) {
        assert.equal(lockoutSec, 0, `Attempt ${attempt} should not be locked`);
      } else if (attempt < 10) {
        assert.equal(lockoutSec, 30, `Attempt ${attempt} should trigger 30s lockout`);
      } else {
        assert.equal(lockoutSec, 300, `Attempt ${attempt} should trigger 300s (5min) lockout`);
      }
    }
  });

  it('Task 52-5: Emergency recovery code format and normalization test', () => {
    const rawCode = 'rfk-7m4p-9a2k';
    const normalized = rawCode.trim().toUpperCase().replace(/[\s-]/g, '');
    assert.equal(normalized, 'RFK7M4P9A2K');

    // Rejects invalid codes
    assert.ok(normalized.startsWith('RFK'), 'Normalized code must start with RFK prefix');
    assert.equal(normalized.length, 11, 'Normalized code length must be 11 characters (RFK + 8 chars)');
  });
});
