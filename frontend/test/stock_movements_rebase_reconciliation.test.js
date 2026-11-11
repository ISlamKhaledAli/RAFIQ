import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Stock Movements Rebase & Running Balance Reconciliation', () => {
  it('correctly calculates backward reconstructed running balance when discrepancy exists', () => {
    // Scenario matching user:
    // Merchant has 468 cigarettes in live stock
    // Recorded movements:
    // 1. Initial (+25 cigarettes)
    // 2. Sale 1 (-11 cigarettes)
    // 3. Sale 2 (-20 cigarettes)
    // 4. Sale 3 (-1 cigarette)
    const currentStockMilli = 468000;
    const movements = [
      { id: 'm4', quantityMilli: -1000, balanceAfterMilli: -7000 },
      { id: 'm3', quantityMilli: -20000, balanceAfterMilli: -6000 },
      { id: 'm2', quantityMilli: -11000, balanceAfterMilli: 14000 },
      { id: 'm1', quantityMilli: 25000, balanceAfterMilli: 25000 },
    ];

    // Calibration logic from StockMovementsModal
    let computedBalances = null;
    if (movements.length > 0 && typeof movements[0].balanceAfterMilli === 'number') {
      const latestBal = movements[0].balanceAfterMilli;
      if (Math.abs(latestBal - currentStockMilli) >= 1000) {
        const map = new Map();
        let running = currentStockMilli;
        for (const m of movements) {
          map.set(m.id, running);
          running -= m.quantityMilli;
        }
        computedBalances = map;
      }
    }

    assert(computedBalances !== null, 'Calibration should activate when latestBal (-7000) differs from currentStockMilli (468000)');

    // Resolved balances for each row
    const resolvedBalances = movements.map(m => {
      return computedBalances ? (computedBalances.get(m.id) ?? m.balanceAfterMilli) : m.balanceAfterMilli;
    });

    assert.strictEqual(resolvedBalances[0], 468000, 'Sale 3 balance should be exactly 468 cigarettes (468,000 milli)');
    assert.strictEqual(resolvedBalances[1], 469000, 'Sale 2 balance should be exactly 469 cigarettes (469,000 milli)');
    assert.strictEqual(resolvedBalances[2], 489000, 'Sale 1 balance should be exactly 489 cigarettes (489,000 milli)');
    assert.strictEqual(resolvedBalances[3], 500000, 'Initial balance after rebase should be exactly 500 cigarettes (500,000 milli)');

    // Ensure NONE of the resolved balances are negative
    for (const bal of resolvedBalances) {
      assert(bal >= 0, `Running balance ${bal} must not be negative`);
    }
  });

  it('correctly maps pack unit cost in cost detail when raw cost matches pack instead of base unit', () => {
    const rawCost = 8202; // 82.02 LE (pack cost recorded in old initial movement)
    const units = [
      { id: 'u1', unitName: 'كرتونة', conversionFactor: 200, isBaseUnit: false, costPricePiasters: 82020 },
      { id: 'u2', unitName: 'علبة', conversionFactor: 20, isBaseUnit: false, costPricePiasters: 8202 },
      { id: 'u3', unitName: 'سيجارة', conversionFactor: 1, isBaseUnit: true, costPricePiasters: 410 },
    ];

    const matchingPackUnit = units.find(
      (u) => u && !u.isBaseUnit && u.conversionFactor > 1 && Math.abs(u.costPricePiasters - rawCost) <= 20
    );

    assert(matchingPackUnit !== undefined, 'Should detect matching pack unit for raw cost 82.02');
    assert.strictEqual(matchingPackUnit.unitName, 'علبة');

    const perBase = Math.round(rawCost / matchingPackUnit.conversionFactor);
    assert.strictEqual(perBase, 410, 'Per base cigarette cost should be 410 piasters (4.10 LE)');
  });
});

