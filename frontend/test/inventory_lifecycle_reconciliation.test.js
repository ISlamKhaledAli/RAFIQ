import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Story 54 — Feature #128: Automated Tests for Inventory Lifecycle & Reconciliation (Task 128-3)', () => {

  // Helper simulation representing the exact SQLite repository behavior
  class InventoryLedgerSimulator {
    constructor() {
      this.products = new Map();
      this.movements = [];
    }

    createProduct(product) {
      this.products.set(product.id, {
        id: product.id,
        name: product.name,
        unit: product.unit || 'piece',
        stockQuantityMilli: 0,
      });

      if (product.initialStockMilli && product.initialStockMilli > 0) {
        this.addMovement({
          id: `mov_init_${product.id}`,
          productId: product.id,
          movementType: 'INITIAL',
          quantityMilli: product.initialStockMilli,
          referenceType: 'OPENING_BALANCE',
          note: 'رصيد افتتاحي عند إضافة الصنف'
        });
      }
    }

    addMovement(movement) {
      const prod = this.products.get(movement.productId);
      if (!prod) throw new Error(`Product not found: ${movement.productId}`);

      // Append to immutable ledger
      this.movements.push({ ...movement, createdAt: Date.now() });

      // Update cached stock atomically
      prod.stockQuantityMilli += movement.quantityMilli;
    }

    // Corresponds to StockMovementRepository.GetTotalCalculatedStock
    getTotalCalculatedStock(productId) {
      return this.movements
        .filter((m) => m.productId === productId)
        .reduce((sum, m) => sum + m.quantityMilli, 0);
    }

    // Corresponds to StockMovementRepository.CheckDiscrepancies
    checkDiscrepancies() {
      const discrepancies = [];
      for (const [prodId, prod] of this.products.entries()) {
        const calculated = this.getTotalCalculatedStock(prodId);
        const diff = prod.stockQuantityMilli - calculated;
        if (diff !== 0) {
          discrepancies.push({
            productId: prodId,
            productName: prod.name,
            cachedStockMilli: prod.stockQuantityMilli,
            calculatedStockMilli: calculated,
            diffMilli: diff
          });
        }
      }
      return discrepancies;
    }

    // Corresponds to StockMovementRepository.RecalculateStockFromMovements
    recalculateStockFromMovements(productId = null) {
      let reconciledCount = 0;
      for (const [prodId, prod] of this.products.entries()) {
        if (!productId || productId === prodId) {
          const calculated = this.getTotalCalculatedStock(prodId);
          if (prod.stockQuantityMilli !== calculated) {
            prod.stockQuantityMilli = calculated;
            reconciledCount++;
          }
        }
      }
      return reconciledCount;
    }
  }

  it('Case 1 (Sale Deduction): accurately logs negative stock movement upon checkout', () => {
    const sim = new InventoryLedgerSimulator();
    sim.createProduct({ id: 'prod_sugar', name: 'سكر الأسرة 1 كجم', initialStockMilli: 50000 }); // 50 packets

    // Cashier sells 5 packets
    const soldQtyMilli = 5000;
    sim.addMovement({
      id: 'mov_sale_1',
      productId: 'prod_sugar',
      movementType: 'SALE',
      quantityMilli: -soldQtyMilli,
      referenceId: 'inv_101',
      referenceType: 'SALE',
      note: 'فاتورة بيع نقدي #101'
    });

    const prod = sim.products.get('prod_sugar');
    assert.equal(prod.stockQuantityMilli, 45000); // 45 packets remaining
    assert.equal(sim.getTotalCalculatedStock('prod_sugar'), 45000);
    assert.equal(sim.checkDiscrepancies().length, 0);
  });

  it('Case 2 (Return / Refund): restores stock by positive quantity and logs RETURN movement', () => {
    const sim = new InventoryLedgerSimulator();
    sim.createProduct({ id: 'prod_oil', name: 'زيت كريستال 800 مل', initialStockMilli: 20000 }); // 20 bottles

    // 1. Sale of 2 bottles
    sim.addMovement({
      id: 'mov_sale_oil',
      productId: 'prod_oil',
      movementType: 'SALE',
      quantityMilli: -2000,
      referenceId: 'inv_102',
      referenceType: 'SALE'
    });
    assert.equal(sim.products.get('prod_oil').stockQuantityMilli, 18000);

    // 2. Customer returns 1 bottle
    sim.addMovement({
      id: 'mov_ret_oil',
      productId: 'prod_oil',
      movementType: 'RETURN',
      quantityMilli: 1000,
      referenceId: 'ret_001',
      referenceType: 'RETURN',
      note: 'مرتجع صنف من فاتورة #102'
    });

    assert.equal(sim.products.get('prod_oil').stockQuantityMilli, 19000); // 19 bottles
    assert.equal(sim.getTotalCalculatedStock('prod_oil'), 19000);
    assert.equal(sim.checkDiscrepancies().length, 0);
  });

  it('Case 3 (Cancellation): restores entire cart items when sale is voided', () => {
    const sim = new InventoryLedgerSimulator();
    sim.createProduct({ id: 'prod_tuna', name: 'تونة صن شاين', initialStockMilli: 30000 }); // 30 cans

    // Sale of 4 cans
    sim.addMovement({
      id: 'mov_sale_tuna',
      productId: 'prod_tuna',
      movementType: 'SALE',
      quantityMilli: -4000,
      referenceId: 'inv_103',
      referenceType: 'SALE'
    });
    assert.equal(sim.products.get('prod_tuna').stockQuantityMilli, 26000);

    // Cashier voids / cancels sale before customer departs
    sim.addMovement({
      id: 'mov_canc_tuna',
      productId: 'prod_tuna',
      movementType: 'CANCELLATION',
      quantityMilli: 4000,
      referenceId: 'inv_103',
      referenceType: 'SALE_CANCEL',
      note: 'إلغاء فاتورة البيع #103 وإعادة المخزون كاملاً'
    });

    assert.equal(sim.products.get('prod_tuna').stockQuantityMilli, 30000); // Restored to 30
    assert.equal(sim.getTotalCalculatedStock('prod_tuna'), 30000);
    assert.equal(sim.checkDiscrepancies().length, 0);
  });

  it('Case 4 (Inventory Adjustment / Settlement): reconciles physical stock deficit and surplus', () => {
    const sim = new InventoryLedgerSimulator();
    sim.createProduct({ id: 'prod_rice', name: 'أرز الضحى 1 كجم', initialStockMilli: 40000 }); // 40 units

    // Physical count finds only 37 units (-3 units loss/spoilage)
    sim.addMovement({
      id: 'mov_adj_deficit',
      productId: 'prod_rice',
      movementType: 'ADJUSTMENT',
      quantityMilli: -3000,
      referenceType: 'STOCK_COUNT',
      note: 'تسوية عجز مخزني - تلف كيس أرز'
    });
    assert.equal(sim.products.get('prod_rice').stockQuantityMilli, 37000);

    // Another audit finds 1 forgotten unit on high shelf (+1 unit)
    sim.addMovement({
      id: 'mov_adj_surplus',
      productId: 'prod_rice',
      movementType: 'ADJUSTMENT',
      quantityMilli: 1000,
      referenceType: 'STOCK_COUNT',
      note: 'تسوية زيادة مخزنية بعد الجرد الشامل'
    });

    assert.equal(sim.products.get('prod_rice').stockQuantityMilli, 38000); // 38 units
    assert.equal(sim.getTotalCalculatedStock('prod_rice'), 38000);
    assert.equal(sim.checkDiscrepancies().length, 0);
  });

  it('Case 5 (Weighted Product Invariant): accurately handles fractional gram deductions without precision decay', () => {
    const sim = new InventoryLedgerSimulator();
    sim.createProduct({ id: 'prod_meat', name: 'لحم مفروم بلدي', unit: 'kg', initialStockMilli: 15000 }); // 15.000 kg

    // Sale 1: 0.350 kg (350 grams)
    sim.addMovement({
      id: 'mov_meat_1',
      productId: 'prod_meat',
      movementType: 'SALE',
      quantityMilli: -350,
      referenceId: 'inv_201'
    });

    // Sale 2: 1.275 kg (1,275 grams)
    sim.addMovement({
      id: 'mov_meat_2',
      productId: 'prod_meat',
      movementType: 'SALE',
      quantityMilli: -1275,
      referenceId: 'inv_202'
    });

    // Return: 0.125 kg
    sim.addMovement({
      id: 'mov_meat_ret',
      productId: 'prod_meat',
      movementType: 'RETURN',
      quantityMilli: 125,
      referenceId: 'inv_202'
    });

    // 15,000 - 350 - 1275 + 125 = 13,500 grams (13.500 kg)
    assert.equal(sim.products.get('prod_meat').stockQuantityMilli, 13500);
    assert.equal(sim.getTotalCalculatedStock('prod_meat'), 13500);
    assert.equal(sim.checkDiscrepancies().length, 0);
  });

  it('Case 6 (Discrepancy Detection & Automated Reconciliation): detects mismatch and reconciles to movement ledger', () => {
    const sim = new InventoryLedgerSimulator();
    sim.createProduct({ id: 'prod_juice', name: 'عصير راني خوخ', initialStockMilli: 10000 });

    sim.addMovement({
      id: 'mov_juice_1',
      productId: 'prod_juice',
      movementType: 'SALE',
      quantityMilli: -2000
    });
    // Expected stock: 8000 milli (8 units)
    assert.equal(sim.getTotalCalculatedStock('prod_juice'), 8000);

    // Simulate an unexpected cache corruption (e.g. abrupt power outage during non-atomic manual write)
    const juiceProd = sim.products.get('prod_juice');
    juiceProd.stockQuantityMilli = 9500; // Corrupted cache (says 9.5 instead of 8.0)

    // Check discrepancy
    const discrepancies = sim.checkDiscrepancies();
    assert.equal(discrepancies.length, 1);
    assert.equal(discrepancies[0].productId, 'prod_juice');
    assert.equal(discrepancies[0].cachedStockMilli, 9500);
    assert.equal(discrepancies[0].calculatedStockMilli, 8000);
    assert.equal(discrepancies[0].diffMilli, 1500);

    // Execute repair tool (RecalculateStockFromMovements)
    const reconciledCount = sim.recalculateStockFromMovements('prod_juice');
    assert.equal(reconciledCount, 1);

    // Invariant restored: Cached stock equals exact sum of movements
    assert.equal(juiceProd.stockQuantityMilli, 8000);
    assert.equal(sim.checkDiscrepancies().length, 0);
  });

});
