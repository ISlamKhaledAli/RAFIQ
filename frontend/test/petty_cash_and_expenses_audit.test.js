import test from 'node:test';
import assert from 'node:assert/strict';

test('Corporate Controller Audit: Petty Cash & Expense Invariants', async (t) => {
  // Test Model Simulation for Shift Reconciliation & Reporting
  
  function calculateShiftBalance({ openingCashPiasters, cashSalesPiasters, drawerExpensesPiasters, safeExpensesPiasters, otherDrawerInflowsPiasters = 0, otherDrawerOutflowsPiasters = 0 }) {
    // Invariant 1: Cash drawer ONLY accounts for drawer expenses. Safe expenses are isolated from drawer float.
    const expectedDrawerCash = openingCashPiasters + cashSalesPiasters + otherDrawerInflowsPiasters - drawerExpensesPiasters - otherDrawerOutflowsPiasters;
    return {
      expectedDrawerCash,
      drawerExpensesPiasters,
      safeExpensesPiasters
    };
  }

  function calculateDailyPL({ grossRevenuePiasters, cogsPiasters, drawerExpensesPiasters, safeExpensesPiasters, cancelledExpensesPiasters = 0 }) {
    // Invariant 2: Net Operating Profit deducts ALL active expenses (both drawer and safe), but strictly EXCLUDES cancelled expenses.
    const grossProfitPiasters = grossRevenuePiasters - cogsPiasters;
    const totalOperatingExpensesPiasters = drawerExpensesPiasters + safeExpensesPiasters;
    const netProfitPiasters = grossProfitPiasters - totalOperatingExpensesPiasters;
    return {
      grossProfitPiasters,
      totalOperatingExpensesPiasters,
      netProfitPiasters,
      cancelledExpensesPiasters
    };
  }

  await t.test('1. Expense Source Isolation: Drawer vs. Safe', () => {
    const shift = calculateShiftBalance({
      openingCashPiasters: 100000, // 1000 EGP
      cashSalesPiasters: 50000,    // 500 EGP
      drawerExpensesPiasters: 7500, // 75 EGP (petty cash for coffee/cleaner from cashier drawer)
      safeExpensesPiasters: 20000   // 200 EGP (store rent / electricity paid directly from main safe)
    });

    // Drawer expected cash must deduct ONLY drawer expenses (1000 + 500 - 75 = 1425 EGP = 142500 piasters)
    assert.equal(shift.expectedDrawerCash, 142500, 'Drawer cash must deduct 7500 piasters drawer expense');
    // Safe expense of 200 EGP must NOT affect the cashier drawer balance
    assert.equal(shift.safeExpensesPiasters, 20000, 'Safe expense must be tracked separately');
  });

  await t.test('2. Impact on Net Profit (P&L): Both sources reduce net profit, cancelled do not', () => {
    const pl = calculateDailyPL({
      grossRevenuePiasters: 250000, // 2500 EGP
      cogsPiasters: 150000,         // 1500 EGP Cost of Goods Sold
      drawerExpensesPiasters: 5000, // 50 EGP (drawer)
      safeExpensesPiasters: 15000,  // 150 EGP (safe)
      cancelledExpensesPiasters: 8000 // 80 EGP cancelled expense (must be ignored in P&L)
    });

    // Gross profit = 2500 - 1500 = 1000 EGP = 100000 piasters
    assert.equal(pl.grossProfitPiasters, 100000);
    // Total operational expenses = 50 + 150 = 200 EGP = 20000 piasters
    assert.equal(pl.totalOperatingExpensesPiasters, 20000);
    // Net profit = 1000 - 200 = 800 EGP = 80000 piasters
    assert.equal(pl.netProfitPiasters, 80000);
  });

  await t.test('3. Anti-Tampering & Cancellation Security Audit', () => {
    // Model for soft cancellation
    const expense = {
      id: 'exp-1234',
      amount_piasters: 6000,
      source: 'drawer',
      is_cancelled: 0,
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null
    };

    function cancelExpense(exp, reason, user, isManager) {
      if (!isManager) {
        throw new Error('صلاحية مدير مطلوبة لإلغاء المصروف');
      }
      if (!reason || reason.trim().length === 0) {
        throw new Error('سبب الإلغاء إلزامي لتوثيق سجل التدقيق');
      }
      return {
        ...exp,
        is_cancelled: 1,
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.username,
        cancel_reason: reason.trim()
      };
    }

    // Attempt without manager rights
    assert.throws(() => {
      cancelExpense(expense, 'صرف بالخطأ', { username: 'cashier1' }, false);
    }, /صلاحية مدير مطلوبة/);

    // Attempt without reason
    assert.throws(() => {
      cancelExpense(expense, '', { username: 'admin' }, true);
    }, /سبب الإلغاء إلزامي/);

    // Valid managerial cancellation with reason
    const cancelled = cancelExpense(expense, 'تم الصرف بالخطأ وإعادة النقدية للدرج', { username: 'admin' }, true);
    assert.equal(cancelled.is_cancelled, 1);
    assert.equal(cancelled.cancelled_by, 'admin');
    assert.equal(cancelled.cancel_reason, 'تم الصرف بالخطأ وإعادة النقدية للدرج');
    assert.ok(cancelled.cancelled_at);
  });

  await t.test('4. Dynamic Categories & Reporting Breakdown', () => {
    const categories = [
      { id: '1', name: 'ضيافة وبوفيه' },
      { id: '2', name: 'نظافة وأدوات' },
      { id: '3', name: 'صيانة ومرافق' }
    ];

    const expensesList = [
      { id: 'e1', category: 'ضيافة وبوفيه', amount_piasters: 3500, source: 'drawer', is_cancelled: 0 },
      { id: 'e2', category: 'ضيافة وبوفيه', amount_piasters: 2500, source: 'safe', is_cancelled: 0 },
      { id: 'e3', category: 'نظافة وأدوات', amount_piasters: 4000, source: 'drawer', is_cancelled: 0 },
      { id: 'e4', category: 'صيانة ومرافق', amount_piasters: 15000, source: 'safe', is_cancelled: 1 } // Cancelled
    ];

    // Group active expenses
    const breakdown = {};
    for (const exp of expensesList) {
      if (exp.is_cancelled === 1) continue;
      if (!breakdown[exp.category]) {
        breakdown[exp.category] = { total_piasters: 0, count: 0, drawer_piasters: 0, safe_piasters: 0 };
      }
      breakdown[exp.category].total_piasters += exp.amount_piasters;
      breakdown[exp.category].count += 1;
      if (exp.source === 'drawer') breakdown[exp.category].drawer_piasters += exp.amount_piasters;
      if (exp.source === 'safe') breakdown[exp.category].safe_piasters += exp.amount_piasters;
    }

    assert.equal(categories.length, 3);
    assert.equal(breakdown['ضيافة وبوفيه'].total_piasters, 6000);
    assert.equal(breakdown['ضيافة وبوفيه'].count, 2);
    assert.equal(breakdown['ضيافة وبوفيه'].drawer_piasters, 3500);
    assert.equal(breakdown['ضيافة وبوفيه'].safe_piasters, 2500);

    assert.equal(breakdown['نظافة وأدوات'].total_piasters, 4000);

    // Cancelled maintenance item must not appear in active breakdown
    assert.equal(breakdown['صيانة ومرافق'], undefined);
  });
});
