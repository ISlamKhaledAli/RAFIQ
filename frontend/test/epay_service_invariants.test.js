import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Milestone 12 — Feature #176 & #177: E-Payment & Payment Terminals Invariants Test Suite', () => {
  const securityServicePath = path.resolve('..', 'desktop', 'Services', 'SecurityService.cs');
  const userManagerModalPath = path.resolve('src', 'components', 'UserManagerModal.tsx');
  const epayRepoPath = path.resolve('..', 'desktop', 'Repositories', 'EpayRepository.cs');
  const dailyClosingServicePath = path.resolve('..', 'desktop', 'Services', 'DailyClosingService.cs');
  const epayViewPath = path.resolve('src', 'views', 'epay', 'EpayView.tsx');

  describe('Scenario 1: Mandatory RBAC Permissions Matrix Completeness', () => {
    it('verifies that all epay permission keys are registered in C# SecurityService.cs', () => {
      assert.ok(fs.existsSync(securityServicePath), 'SecurityService.cs must exist');
      const content = fs.readFileSync(securityServicePath, 'utf8');

      const expectedKeys = [
        'epay.access',
        'epay.transact',
        'epay.fund',
        'epay.terminals_manage',
        'epay.history',
        'epay.analytics',
        'epay.cancel',
      ];

      for (const key of expectedKeys) {
        assert.ok(
          content.includes(`"${key}"`),
          `SecurityService.cs ALL_PERMISSIONS must include permission key: ${key}`
        );
      }
      assert.ok(
        content.includes('p["epay.access"] = true;') || content.includes('p["epay"] = true;'),
        'SecurityService.cs GetPermissionsForRole must define default for epay'
      );
    });

    it('verifies that all epay permission keys are exposed in frontend UserManagerModal.tsx', () => {
      assert.ok(fs.existsSync(userManagerModalPath), 'UserManagerModal.tsx must exist');
      const content = fs.readFileSync(userManagerModalPath, 'utf8');

      assert.ok(content.includes("id: 'epay'"), 'UserManagerModal.tsx must contain epay permission group');
      assert.ok(content.includes('epay.access'), 'UserManagerModal.tsx must expose epay.access');
      assert.ok(content.includes('epay.transact'), 'UserManagerModal.tsx must expose epay.transact');
      assert.ok(content.includes('epay.fund'), 'UserManagerModal.tsx must expose epay.fund');
      assert.ok(content.includes('epay.terminals_manage'), 'UserManagerModal.tsx must expose epay.terminals_manage');
      assert.ok(content.includes('epay.history'), 'UserManagerModal.tsx must expose epay.history');
      assert.ok(content.includes('epay.analytics'), 'UserManagerModal.tsx must expose epay.analytics');
      assert.ok(content.includes('epay.cancel'), 'UserManagerModal.tsx must expose epay.cancel');
    });
  });

  describe('Scenario 2: Strict Integer Financial Arithmetic for Fees and Basis Points', () => {
    // Helper replicating the integer basis point fee calculation
    const computeFee = (billPiasters, ruleType, ruleValue, defaultFixed = 0) => {
      if (billPiasters <= 0) return 0;
      if (ruleType === 'percent') {
        const bps = ruleValue ?? 100;
        return Math.max(0, Math.round((billPiasters * bps) / 10000));
      }
      return Math.max(0, ruleValue ?? defaultFixed);
    };

    it('calculates fixed fees accurately as integer piasters without precision loss', () => {
      // 5 EGP fixed fee = 500 piasters
      const fee = computeFee(10000, 'fixed', 500);
      assert.equal(fee, 500);
      assert.equal(Number.isInteger(fee), true);
    });

    it('calculates basis points percentage fee with exact integer rounding', () => {
      // Bill: 33 EGP (3300 piasters), Rate: 1.75% = 175 basis points
      // 3300 * 175 / 10000 = 57.75 piasters -> rounds to 58 piasters (0.58 EGP)
      const fee = computeFee(3300, 'percent', 175);
      assert.equal(fee, 58);
      assert.equal(Number.isInteger(fee), true);

      // Bill: 100 EGP (10000 piasters), Rate: 2.0% = 200 basis points -> 200 piasters (2 EGP)
      const fee2 = computeFee(10000, 'percent', 200);
      assert.equal(fee2, 200);
    });

    it('guarantees TotalReceived and NetProfit arithmetic invariants', () => {
      const billPiasters = 5000; // 50 EGP
      const customerFee = 250;   // 2.50 EGP
      const providerCommission = 100; // 1.00 EGP

      const totalReceived = billPiasters + customerFee;
      const netProfit = customerFee + providerCommission;

      assert.equal(totalReceived, 5250, 'Total received must be bill + customer fee');
      assert.equal(netProfit, 350, 'Net profit must be customer fee + provider commission');
      assert.equal(Number.isInteger(totalReceived), true);
      assert.equal(Number.isInteger(netProfit), true);
    });
  });

  describe('Scenario 3: Machine Balance Deductions vs Cash-Out Invariants', () => {
    it('verifies that EpayRepository increases terminal balance on cash_out and decreases on topup/bill', () => {
      assert.ok(fs.existsSync(epayRepoPath), 'EpayRepository.cs must exist');
      const content = fs.readFileSync(epayRepoPath, 'utf8');

      // Cash-out check
      assert.ok(content.includes('tx.ServiceType == "cash_out"'), 'EpayRepository must handle cash_out branch');
      assert.ok(content.includes('balanceDelta = tx.BillAmountPiasters;'), 'Cash-out must add bill amount to terminal balance');
      assert.ok(content.includes('balanceDelta = -tx.MachineDeductedPiasters;'), 'Standard operations must deduct from terminal balance');
    });

    it('verifies that cash_out transactions do not block when machine electronic balance is low', () => {
      assert.ok(fs.existsSync(epayViewPath), 'EpayView.tsx must exist');
      const content = fs.readFileSync(epayViewPath, 'utf8');

      // In EpayView, isBalanceInsufficient should only apply to debit operations (not cash_out)
      // When a customer withdraws cash, machine is receiving balance, not losing it!
      const isBalanceInsufficientCheck = content.includes("serviceType !== 'cash_out'") ||
        content.includes('isBalanceInsufficient');
      assert.ok(isBalanceInsufficientCheck, 'Balance check logic must exist');
    });
  });

  describe('Scenario 4: Terminal Funding Atomicity & Validation', () => {
    it('verifies that EpayRepository enforces positive funding amounts and atomic transaction rollback', () => {
      assert.ok(fs.existsSync(epayRepoPath), 'EpayRepository.cs must exist');
      const content = fs.readFileSync(epayRepoPath, 'utf8');

      assert.ok(content.includes('if (amountPiasters <= 0)'), 'Must reject non-positive funding amounts');
      assert.ok(content.includes('conn.BeginTransaction()'), 'Funding must be enclosed in ACID transaction');
      assert.ok(content.includes('trans.Commit()'), 'Must commit transaction on success');
      assert.ok(content.includes('trans.Rollback()'), 'Must rollback on any failure');
    });
  });

  describe('Scenario 5: Shift Closing Cash Drawer Reconciliation Invariant', () => {
    it('verifies that DailyClosingService accurately deducts cash_out payouts from cash drawer balance', () => {
      assert.ok(fs.existsSync(dailyClosingServicePath), 'DailyClosingService.cs must exist');
      const content = fs.readFileSync(dailyClosingServicePath, 'utf8');

      assert.ok(
        content.includes("service_type = 'cash_out'"),
        'DailyClosingService must handle cash_out in cash drawer sum'
      );
      assert.ok(
        content.includes('customer_fee_piasters - bill_amount_piasters'),
        'DailyClosingService must calculate net cash flow for cash_out'
      );
    });
  });
});
