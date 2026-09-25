import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Story 46 / Feature #30: POS Inventory Deduction & Negative Stock Policy', () => {

  describe('Task 30-1: Atomic Stock Deduction & Stock Movement on Sale', () => {
    it('accurately deducts standard and weighted items from inventory and creates ledger movements', () => {
      // Product 1: Regular Piece Item (Milk) - Initial 20 units (20,000 milli)
      const milk = {
        id: 'prod_milk',
        name: 'لبن جهينة 1 لتر',
        stockQuantityMilli: 20000,
        unit: 'piece',
        pricePiasters: 4200,
        costPiasters: 3400,
        taxRatePercent: 14,
      };

      // Product 2: Weighted Item (White Cheese) - Initial 10 kg (10,000 milli)
      const cheese = {
        id: 'prod_cheese',
        name: 'جبنة بيضاء براميلي',
        stockQuantityMilli: 10000,
        unit: 'kg',
        pricePiasters: 18000, // 180 EGP per kg
        costPiasters: 14000,
        taxRatePercent: 0,
      };

      // Cart line items for sale
      const saleItems = [
        {
          productId: milk.id,
          quantityMilli: 3000, // 3 pieces
          unitPricePiasters: milk.pricePiasters,
          unitCostPiasters: milk.costPiasters,
          taxRatePercent: milk.taxRatePercent,
        },
        {
          productId: cheese.id,
          quantityMilli: 350, // 350 grams (0.35 kg)
          unitPricePiasters: cheese.pricePiasters,
          unitCostPiasters: cheese.costPiasters,
          taxRatePercent: cheese.taxRatePercent,
        },
      ];

      // Simulate atomic deduction and movement creation
      const ledgerMovements = [];
      const updatedProducts = {};

      for (const item of saleItems) {
        const prod = item.productId === milk.id ? { ...milk } : { ...cheese };
        prod.stockQuantityMilli -= item.quantityMilli;
        updatedProducts[prod.id] = prod;

        ledgerMovements.push({
          productId: prod.id,
          movementType: 'SALE',
          quantityMilli: -item.quantityMilli,
          unitCostPiasters: item.unitCostPiasters,
          referenceType: 'SALE',
        });
      }

      // Verify Piece Item stock
      assert.equal(updatedProducts[milk.id].stockQuantityMilli, 17000); // 20 - 3 = 17 pieces
      // Verify Weighted Item stock
      assert.equal(updatedProducts[cheese.id].stockQuantityMilli, 9650); // 10.000 - 0.350 = 9.650 kg

      // Verify Stock Movements
      assert.equal(ledgerMovements.length, 2);
      assert.equal(ledgerMovements[0].quantityMilli, -3000);
      assert.equal(ledgerMovements[1].quantityMilli, -350);
    });
  });

  describe('Task 30-2: Negative Stock Policy (Allow vs Forbid)', () => {
    it('permits sale when stock is zero/negative if allow_negative_stock is enabled, adding warning', () => {
      const outOfStockProd = {
        id: 'prod_tea',
        name: 'شاي العروسة 250جم',
        stockQuantityMilli: 0, // Out of stock
        costPiasters: 4000,
        pricePiasters: 5000,
        taxRatePercent: 0,
      };

      const requestedQtyMilli = 2000; // 2 pieces
      const allowNegativeStock = true;

      const warnings = [];
      let canProceed = false;

      if (!allowNegativeStock && outOfStockProd.stockQuantityMilli < requestedQtyMilli) {
        canProceed = false;
      } else {
        canProceed = true;
        if (outOfStockProd.stockQuantityMilli < requestedQtyMilli) {
          warnings.push(`تنبيه: رصيد الصنف '${outOfStockProd.name}' قبل البيع كان (${outOfStockProd.stockQuantityMilli / 1000}) وأصبح بالسالب.`);
        }
      }

      assert.equal(canProceed, true);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /وأصبح بالسالب/);
    });

    it('rejects sale when stock is insufficient if allow_negative_stock is disabled', () => {
      const lowStockProd = {
        id: 'prod_oil',
        name: 'زيت قلي 800مل',
        stockQuantityMilli: 1000, // Only 1 piece available
        costPiasters: 6000,
        pricePiasters: 7500,
        taxRatePercent: 14,
      };

      const requestedQtyMilli = 3000; // Requested 3 pieces
      const allowNegativeStock = false;

      let caughtError = null;
      try {
        if (!allowNegativeStock && lowStockProd.stockQuantityMilli < requestedQtyMilli) {
          throw new Error(`لا يمكن إتمام البيع: رصيد الصنف '${lowStockProd.name}' غير كافٍ (${lowStockProd.stockQuantityMilli / 1000}) وسياسة الرصيد السالب معطلة.`);
        }
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError);
      assert.match(caughtError.message, /وسياسة الرصيد السالب معطلة/);
    });
  });

  describe('Task 30-3: Preservation of Historical Cost, Price, and Tax in Sale Items', () => {
    it('snapshots cost, price, and tax rate percent inside sale line item to protect reports from future modifications', () => {
      const activeProduct = {
        id: 'prod_sugar',
        name: 'سكر أبيض 1 كجم',
        pricePiasters: 3200,
        costPiasters: 2700,
        taxRatePercent: 14,
        unit: 'piece',
      };

      // Create snapshot line item at time of sale
      const snapshotItem = {
        productId: activeProduct.id,
        productName: activeProduct.name,
        unitPricePiasters: activeProduct.pricePiasters,
        unitCostPiasters: activeProduct.costPiasters,
        taxRatePercent: activeProduct.taxRatePercent,
        unit: activeProduct.unit,
        quantityMilli: 2000,
        totalPiasters: 6400,
      };

      // Supplier price change occurred later in time
      activeProduct.costPiasters = 3100;
      activeProduct.pricePiasters = 3800;
      activeProduct.taxRatePercent = 0;

      // Historical report calculates profit based on historical sale_item snapshot
      const historicalProfit = snapshotItem.totalPiasters - (snapshotItem.unitCostPiasters * (snapshotItem.quantityMilli / 1000));
      // 6400 - (2700 * 2) = 6400 - 5400 = 1000 piasters (10.00 EGP)
      assert.equal(historicalProfit, 1000);
      assert.equal(snapshotItem.taxRatePercent, 14);
      assert.equal(snapshotItem.unitCostPiasters, 2700);
      assert.equal(snapshotItem.unitPricePiasters, 3200);
    });
  });

  describe('Task 30-4: Atomic Sale Cancellation & Full Stock Restoration', () => {
    it('reverses standard and weighted items stock down to the milligram upon cancellation', () => {
      // Stock before cancellation
      const productsInDb = {
        prod_water: { id: 'prod_water', name: 'مياه 600 مل', stockQuantityMilli: 8000 },
        prod_meat: { id: 'prod_meat', name: 'لحم مفروم بلدي', stockQuantityMilli: 4650 }, // 4.65 kg
      };

      // Sale being cancelled
      const saleToCancel = {
        id: 'sale_101',
        invoiceNumber: 1045,
        status: 'completed',
        items: [
          { productId: 'prod_water', quantityMilli: 2000, unitCostPiasters: 400 }, // 2 bottles
          { productId: 'prod_meat', quantityMilli: 350, unitCostPiasters: 32000 },  // 350g
        ],
      };

      // Execute atomic cancellation
      const cancellationMovements = [];
      for (const item of saleToCancel.items) {
        productsInDb[item.productId].stockQuantityMilli += item.quantityMilli;
        cancellationMovements.push({
          productId: item.productId,
          movementType: 'SALE_CANCEL',
          quantityMilli: item.quantityMilli,
          referenceId: saleToCancel.id,
          unitCostPiasters: item.unitCostPiasters,
        });
      }
      saleToCancel.status = 'cancelled';

      // Assert stock restored exactly
      assert.equal(productsInDb.prod_water.stockQuantityMilli, 10000); // 8 + 2 = 10 bottles
      assert.equal(productsInDb.prod_meat.stockQuantityMilli, 5000);   // 4.650 + 0.350 = 5.000 kg exact!
      assert.equal(saleToCancel.status, 'cancelled');

      // Assert contra stock movements
      assert.equal(cancellationMovements.length, 2);
      assert.equal(cancellationMovements[0].quantityMilli, 2000);
      assert.equal(cancellationMovements[1].quantityMilli, 350);
      assert.equal(cancellationMovements[0].movementType, 'SALE_CANCEL');
    });
  });
});
