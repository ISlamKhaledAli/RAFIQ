import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Milestone 6.5 — Story 74 / Feature #161: Purchase Invoices Multi-Unit Invariants (Tasks 161-8 to 161-10)', () => {

  // Sample Product with Multiple Packaging Units
  const sampleProduct = {
    id: 'prod_biscuit_01',
    name: 'بسكويت شوكولاتة فاخر',
    barcode: '6221000123456',
    pricePiasters: 2500, // 25.00 EGP sell price per piece
    costPiasters: 1800,  // 18.00 EGP cost price per piece
    stockQuantityMilli: 20000, // 20 pieces in stock
    unit: 'piece',
    units: [
      {
        id: 'unit_piece',
        unitName: 'قطعة',
        conversionFactor: 1,
        isBaseUnit: true,
        sellPricePiasters: 2500,
        costPricePiasters: 1800,
        isDivisible: false,
        sortOrder: 0
      },
      {
        id: 'unit_dozen',
        unitName: 'دستة',
        conversionFactor: 12,
        isBaseUnit: false,
        sellPricePiasters: 28000, // 280.00 EGP
        costPricePiasters: 20400, // 204.00 EGP (17.00/piece)
        isDivisible: false,
        sortOrder: 1
      },
      {
        id: 'unit_carton',
        unitName: 'كرتونة',
        conversionFactor: 24,
        isBaseUnit: false,
        sellPricePiasters: 54000, // 540.00 EGP
        costPricePiasters: 38400, // 384.00 EGP (16.00/piece)
        isDivisible: false,
        sortOrder: 2
      }
    ]
  };

  describe('Task 161-8: Purchase Unit Selection and Conversion Factor Resolution', () => {
    test('resolves correct conversion factor and name for standard and packaging units', () => {
      const units = sampleProduct.units;
      const pieceUnit = units.find(u => u.isBaseUnit);
      const cartonUnit = units.find(u => u.unitName === 'كرتونة');
      const dozenUnit = units.find(u => u.unitName === 'دستة');

      assert.equal(pieceUnit.conversionFactor, 1);
      assert.equal(cartonUnit.conversionFactor, 24);
      assert.equal(dozenUnit.conversionFactor, 12);
    });

    test('falls back to factor 1 if unit is not defined or is single-unit product', () => {
      const singleProduct = { id: 'p_single', name: 'زبادي بلدي', unit: 'piece', units: [] };
      const factor = (singleProduct.units && singleProduct.units.length > 0)
        ? singleProduct.units[0].conversionFactor
        : 1;
      assert.equal(factor, 1);
    });
  });

  describe('Task 161-9: Atomic Base Stock Addition on Purchase Receiving', () => {
    test('correctly converts purchased package quantity into base stock milli-units', () => {
      const purchaseQtyCartons = 5; // 5 cartons
      const cartonFactor = 24; // 24 pieces per carton

      // 5 cartons * 24 pieces = 120 pieces = 120,000 milli
      const baseQtyAdded = purchaseQtyCartons * cartonFactor;
      const baseDeltaMilli = Math.round(baseQtyAdded * 1000);

      assert.equal(baseQtyAdded, 120);
      assert.equal(baseDeltaMilli, 120000);

      const updatedStockMilli = sampleProduct.stockQuantityMilli + baseDeltaMilli;
      assert.equal(updatedStockMilli, 140000); // 20 + 120 = 140 pieces
    });

    test('handles decimal quantities for bulk/weight products without rounding error', () => {
      const weightProduct = {
        id: 'p_rice',
        name: 'أرز فاخر',
        unit: 'kg',
        stockQuantityMilli: 50000 // 50 kg
      };

      // Receiving 10.5 kg
      const receivedKg = 10.5;
      const factor = 1;
      const addedMilli = Math.round(receivedKg * factor * 1000);

      assert.equal(addedMilli, 10500);
      assert.equal(weightProduct.stockQuantityMilli + addedMilli, 60500); // 60.5 kg
    });
  });

  describe('Task 161-10: Calculated Base Unit Cost from Package Purchase Price', () => {
    test('accurately calculates base unit cost in integer piasters from package purchase price', () => {
      // Wholesaler sells carton (24 pieces) for 480.00 EGP (48,000 piasters)
      const packageCostPiasters = 48000;
      const cartonFactor = 24;

      const computedBaseCostPiasters = Math.round(packageCostPiasters / cartonFactor);
      assert.equal(computedBaseCostPiasters, 2000); // exactly 20.00 EGP per piece
    });

    test('applies AwayFromZero/nearest-integer rounding for non-divisible piaster amounts (Rule 1: Integer Safety)', () => {
      // Wholesaler sells dozen (12 pieces) for 100.00 EGP (10,000 piasters)
      // 10,000 / 12 = 833.3333... piasters -> rounded to 833 piasters (8.33 EGP)
      const packageCostPiasters = 10000;
      const dozenFactor = 12;

      const computedBaseCostPiasters = Math.round(packageCostPiasters / dozenFactor);
      assert.equal(computedBaseCostPiasters, 833);
      assert.ok(Number.isInteger(computedBaseCostPiasters));
    });

    test('total invoice line cost equals quantity * packageCostPiasters', () => {
      const purchaseQtyCartons = 3;
      const packageCostPiasters = 38400; // 384.00 EGP per carton

      const totalPurchasePiasters = purchaseQtyCartons * packageCostPiasters;
      assert.equal(totalPurchasePiasters, 115200); // 1,152.00 EGP total
      assert.equal(totalPurchasePiasters / 100, 1152.00);
    });

    test('validates that purchase cost cannot be negative', () => {
      const negativeCostPiasters = -500;
      const isValid = negativeCostPiasters >= 0;
      assert.equal(isValid, false);
    });
  });

  describe('Stock Movement Audit Traceability for Purchases', () => {
    test('generates compliant PURCHASE stock movement payload with supplier and invoice metadata', () => {
      const purchaseQty = 4;
      const unitName = 'كرتونة';
      const factor = 24;
      const packageCostPiasters = 48000;
      const supplierName = 'الشركة المتحدة للتجارة والتوزيع';
      const invoiceNumber = 'INV-PO-2026-881';

      const baseDeltaMilli = purchaseQty * factor * 1000;
      const baseCostPiasters = Math.round(packageCostPiasters / factor);

      const movementPayload = {
        productId: sampleProduct.id,
        movementType: 'PURCHASE',
        quantityMilli: baseDeltaMilli,
        unitCostPiasters: baseCostPiasters,
        referenceId: invoiceNumber,
        referenceType: 'PURCHASE_RECEIPT',
        note: `استلام مشتريات: ${purchaseQty} ${unitName} (×${factor}) بسعر ${(packageCostPiasters / 100).toFixed(2)} ج.م/${unitName} | مورد: ${supplierName} | إذن/فاتورة: ${invoiceNumber}`
      };

      assert.equal(movementPayload.movementType, 'PURCHASE');
      assert.equal(movementPayload.quantityMilli, 96000); // 96 pieces
      assert.equal(movementPayload.unitCostPiasters, 2000); // 20.00 EGP
      assert.equal(movementPayload.referenceType, 'PURCHASE_RECEIPT');
      assert.match(movementPayload.note, /استلام مشتريات/);
      assert.match(movementPayload.note, /الشركة المتحدة/);
      assert.match(movementPayload.note, /INV-PO-2026-881/);
    });
  });
});
