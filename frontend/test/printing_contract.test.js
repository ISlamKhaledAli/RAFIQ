import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readPrintResult, receiptPrintRequest } from '../src/utils/printing.ts';

describe('Stored receipt printing contract', () => {
  it('prints only a stored ID and explicitly suppresses drawer output for copies', () => {
    assert.deepEqual(receiptPrintRequest(' invoice-id '), {
      saleId: 'invoice-id', isCopy: true, openDrawer: false,
    });
    assert.deepEqual(receiptPrintRequest('invoice-id', false), {
      saleId: 'invoice-id', isCopy: false,
    });
    assert.throws(() => receiptPrintRequest(' '), /معرّف/);
  });

  it('preserves paper success independently from a blocked drawer', () => {
    const result = {
      success: true,
      message: 'queued',
      printerUsed: 'test-queue',
      drawerStatus: 'blocked',
      warningCode: 'DRAWER_HARDWARE_NOT_APPROVED',
      warningMessage: 'No command submitted',
    };
    assert.strictEqual(readPrintResult(result), result);
  });

  it('preserves explicit queue failure rather than treating the envelope as printing success', () => {
    const result = {
      success: false, message: 'offline', printerUsed: 'test-queue',
      drawerStatus: 'notRequested', warningCode: null, warningMessage: null,
    };
    assert.equal(readPrintResult(result).success, false);
  });

  it('rejects obsolete aliases, missing fields and invalid status types', () => {
    for (const result of [
      null, undefined, { ok: true }, { Success: true, Message: 'queued' },
      { success: 'true', message: 'queued', printerUsed: '', drawerStatus: 'notRequested' },
      { success: true, message: 'queued', printerUsed: '', drawerStatus: 'opened' },
      { success: true, message: 'queued', printerUsed: '', drawerStatus: 'blocked', warningMessage: {} },
    ]) {
      assert.throws(() => readPrintResult(result), /استجابة الطباعة/);
    }
  });
});
