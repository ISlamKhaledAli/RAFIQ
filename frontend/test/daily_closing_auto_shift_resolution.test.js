import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Senior Architecture: تسوية وإغلاق الورديات المفتوحة مع الإقفال اليومي (Auto Shift Resolution)', () => {
  const modalPath = path.resolve(__dirname, '../src/components/DailyClosingModal.tsx');
  const modalCode = fs.readFileSync(modalPath, 'utf8');

  const modelsPath = path.resolve(__dirname, '../src/types/models.ts');
  const modelsCode = fs.readFileSync(modelsPath, 'utf8');

  const ipcPath = path.resolve(__dirname, '../src/bridge/ipc.ts');
  const ipcCode = fs.readFileSync(ipcPath, 'utf8');

  const csharpServicePath = path.resolve(__dirname, '../../desktop/Services/DailyClosingService.cs');
  const csharpServiceCode = fs.readFileSync(csharpServicePath, 'utf8');

  it('1. DailyClosingPreview and DailyClosingSaveRequest support openShifts and autoClosePendingShifts', () => {
    assert.match(modelsCode, /openShifts\?:\s*Shift\[\];/);
    assert.match(modelsCode, /autoClosePendingShifts\?:\s*boolean;/);
    assert.match(modelsCode, /export interface AutoCloseShiftsResult/);
  });

  it('2. IPC Bridge defines closing:autoCloseShifts handler', () => {
    assert.match(ipcCode, /case 'closing:autoCloseShifts':/);
    assert.match(ipcCode, /closedCount:/);
    assert.match(ipcCode, /totalExpectedCashPiasters:/);
  });

  it('3. DailyClosingModal features one-click auto-resolution without navigating away', () => {
    assert.match(modalCode, /handleAutoCloseShifts/);
    assert.match(modalCode, /invoke<AutoCloseShiftsResult>\('closing:autoCloseShifts'/);
    assert.match(modalCode, /emitDataChanged\('shifts'\)/);
    assert.match(modalCode, /تسوية وإغلاق جميع الورديات المفتوحة الآن/);
  });

  it('4. DailyClosingModal displays active and hanging open shifts list in a structured preview', () => {
    assert.match(modalCode, /preview\.openShifts && preview\.openShifts\.length > 0/);
    assert.match(modalCode, /وردية #\{s\.shiftNumber\}/);
    assert.match(modalCode, /formatArabicCurrency\(s\.openingFloatPiasters\)/);
  });

  it('5. Main closing button enables seamless closing with autoClosePendingShifts guarantee', () => {
    assert.match(modalCode, /autoClosePendingShifts:\s*true/);
    assert.match(modalCode, /اعتماد وتقفيل اليومية \(مع تسوية الورديات\)/);
  });

  it('6. Backend C# DailyClosingService implements atomic AutoClosePendingShifts and SaveClosing integration', () => {
    assert.match(csharpServiceCode, /public AutoCloseShiftsResult AutoClosePendingShifts/);
    assert.match(csharpServiceCode, /lock \(SaleService\.FinancialWriteLock\)/);
    assert.match(csharpServiceCode, /_shiftRepo\.CloseShift\(shift, conn, trans\)/);
    assert.match(csharpServiceCode, /SHIFT_AUTO_CLOSE_BY_DAILY_CLOSING/);
    assert.match(csharpServiceCode, /if \(request\.AutoClosePendingShifts\)/);
  });

  it('7. Enforces Zero Emojis and Design Token Compliance in the new components', () => {
    // Regex checking no unicode emojis in DailyClosingModal
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test(modalCode), false, 'DailyClosingModal must have zero emojis');
  });
});

