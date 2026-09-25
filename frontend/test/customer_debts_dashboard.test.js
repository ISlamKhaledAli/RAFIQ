import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Feature #44: Customer Outstanding Debts & Dashboard Metrics (Story 70 / Tasks 44-1 to 44-2)
 * Invariants tested:
 * 1. Aggregates only positive debts (balancePiasters > 0), strictly excluding zero/negative credit balances.
 * 2. Accurately counts distinct debtor customers.
 * 3. Ranks top debtors in descending order by debt amount.
 * 4. Limits top debtors preview list to top 5.
 * 5. Arithmetic strictly operates in integer piasters without precision loss.
 */

function calculateCustomerDebtsMetrics(customers) {
  let totalDebtsPiasters = 0;
  const debtors = [];

  for (const c of customers) {
    const bal = c.balancePiasters || 0;
    if (bal > 0) {
      totalDebtsPiasters += bal;
      debtors.push({
        customerId: c.id,
        customerName: c.name,
        customerPhone: c.phone || '',
        balancePiasters: bal,
        balanceFormatted: `${(bal / 100).toFixed(2)} ج.م`,
      });
    }
  }

  // Sort descending by debt
  debtors.sort((a, b) => b.balancePiasters - a.balancePiasters);
  const topDebtors = debtors.slice(0, 5);

  return {
    totalCustomerDebtsPiasters: totalDebtsPiasters,
    totalCustomerDebtsFormatted: `${(totalDebtsPiasters / 100).toFixed(2)} ج.م`,
    debtorsCount: debtors.length,
    topDebtors,
  };
}

test('Feature #44: Customer Debts Metrics & Dashboard Invariants (Story 70)', async (t) => {
  const sampleCustomers = [
    { id: 'c1', name: 'أحمد محمود', phone: '0101', balancePiasters: 15000 }, // 150.00 EGP
    { id: 'c2', name: 'محمد إبراهيم', phone: '0102', balancePiasters: 0 }, // 0
    { id: 'c3', name: 'خالد عبد الله', phone: '0103', balancePiasters: 45000 }, // 450.00 EGP
    { id: 'c4', name: 'سامي رزق', phone: '0104', balancePiasters: -5000 }, // Credit in customer favor
    { id: 'c5', name: 'محمود جاد', phone: '0105', balancePiasters: 80000 }, // 800.00 EGP
    { id: 'c6', name: 'ياسر كمال', phone: '0106', balancePiasters: 25000 }, // 250.00 EGP
    { id: 'c7', name: 'هشام فؤاد', phone: '0107', balancePiasters: 35000 }, // 350.00 EGP
    { id: 'c8', name: 'فاروق توفيق', phone: '0108', balancePiasters: 12000 }, // 120.00 EGP
  ];

  await t.test('1. Accurately sums positive debts and excludes zero & negative balances', () => {
    const metrics = calculateCustomerDebtsMetrics(sampleCustomers);
    // Positive balances: 15000 + 45000 + 80000 + 25000 + 35000 + 12000 = 212000 piasters (2,120.00 EGP)
    assert.equal(metrics.totalCustomerDebtsPiasters, 212000);
    assert.equal(metrics.totalCustomerDebtsFormatted, '2120.00 ج.م');
    assert.equal(metrics.debtorsCount, 6);
  });

  await t.test('2. Ranks top debtors strictly descending by highest debt', () => {
    const metrics = calculateCustomerDebtsMetrics(sampleCustomers);
    assert.equal(metrics.topDebtors.length, 5); // Capped at top 5
    assert.equal(metrics.topDebtors[0].customerId, 'c5'); // 800.00 EGP
    assert.equal(metrics.topDebtors[1].customerId, 'c3'); // 450.00 EGP
    assert.equal(metrics.topDebtors[2].customerId, 'c7'); // 350.00 EGP
    assert.equal(metrics.topDebtors[3].customerId, 'c6'); // 250.00 EGP
    assert.equal(metrics.topDebtors[4].customerId, 'c1'); // 150.00 EGP
  });

  await t.test('3. Handles scenario with zero debtors gracefully', () => {
    const metrics = calculateCustomerDebtsMetrics([
      { id: 'c1', name: 'أحمد', balancePiasters: 0 },
      { id: 'c2', name: 'سارة', balancePiasters: -2000 },
    ]);
    assert.equal(metrics.totalCustomerDebtsPiasters, 0);
    assert.equal(metrics.debtorsCount, 0);
    assert.equal(metrics.topDebtors.length, 0);
  });
});
