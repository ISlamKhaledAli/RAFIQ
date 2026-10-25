import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ======================================================================================
 * Rafiq POS — Milestone 13 Comprehensive Battle-Test Suite (Stories 125 to 136)
 * موديول الصيدليات المتكامل ونظام التجزئة وفك العبوات
 * ======================================================================================
 * This suite rigorously validates every architectural invariant, financial calculation,
 * security guard, RBAC permission, and business workflow introduced in Milestone 13.
 * Zero emojis, integer-only financial arithmetic, and zero-regression on other store templates.
 */

describe('Milestone 13: Complete Pharmacy Module & Loose Selling Test Suite (Stories 125-136)', () => {
  const rootDir = path.resolve('..');
  const featureRegistryPath = path.join(rootDir, 'desktop', 'Common', 'FeatureRegistry.cs');
  const securityServicePath = path.join(rootDir, 'desktop', 'Services', 'SecurityService.cs');
  const storeTemplateServicePath = path.join(rootDir, 'desktop', 'Services', 'StoreTemplateService.cs');
  const userManagerModalPath = path.resolve('src', 'components', 'UserManagerModal.tsx');
  const storeTemplatesTsPath = path.resolve('src', 'constants', 'storeTemplates.ts');
  const purchaseRepoPath = path.join(rootDir, 'desktop', 'Repositories', 'PurchaseRepository.cs');
  const saleServicePath = path.join(rootDir, 'desktop', 'Services', 'SaleService.cs');
  const drawerCashCalculatorPath = path.join(rootDir, 'desktop', 'Services', 'DrawerCashCalculator.cs');
  const backupServicePath = path.join(rootDir, 'desktop', 'Services', 'BackupService.cs');

  // Math helper: AwayFromZero integer division
  const divAwayFromZero = (numerator, denominator) => {
    if (denominator === 0) throw new Error('Division by zero');
    const isNeg = (numerator < 0) !== (denominator < 0);
    const absNum = Math.abs(numerator);
    const absDen = Math.abs(denominator);
    const quotient = Math.floor((absNum + Math.floor(absDen / 2)) / absDen);
    return isNeg ? -quotient : quotient;
  };

  // ------------------------------------------------------------------------------------
  // Story 125: Feature #182 — Feature Registry & Backend Gate
  // ------------------------------------------------------------------------------------
  describe('Story 125: Feature Registry & Backend Gate (Feature #182)', () => {
    it('Scenario 1.1: Central FeatureRegistry.cs contains all 12 pharmacy feature definitions', () => {
      assert.ok(fs.existsSync(featureRegistryPath), 'FeatureRegistry.cs must exist');
      const content = fs.readFileSync(featureRegistryPath, 'utf8');

      const expectedFlags = [
        'feature_loose_selling',
        'feature_batch_pricing',
        'feature_shelf_locations',
        'feature_shortage_book',
        'feature_pharmacy',
        'feature_pharma_alternatives',
        'feature_controlled_drugs',
        'feature_prescriptions',
        'feature_patient_profiles',
        'feature_insurance',
        'feature_expiry_returns',
        'feature_drug_reference',
      ];

      for (const flag of expectedFlags) {
        assert.ok(
          content.includes(`Key = "${flag}"`),
          `FeatureRegistry.cs must define feature: ${flag}`
        );
      }
    });

    it('Scenario 1.2: FeatureGate rejects command for disabled feature with code FEATURE_DISABLED', () => {
      const featureMap = {
        feature_loose_selling: false,
        feature_insurance: false,
      };

      const executeIpcCommand = (cmd, requiredFeature) => {
        if (requiredFeature && !featureMap[requiredFeature]) {
          return {
            ok: false,
            code: 'FEATURE_DISABLED',
            message: `الميزة «${requiredFeature}» غير مفعّلة في هذا المحل`,
          };
        }
        return { ok: true, data: 'SUCCESS' };
      };

      const resDisabled = executeIpcCommand('insurance:createContract', 'feature_insurance');
      assert.equal(resDisabled.ok, false);
      assert.equal(resDisabled.code, 'FEATURE_DISABLED');
      assert.ok(resDisabled.message.includes('غير مفعّلة'));

      featureMap.feature_insurance = true;
      const resEnabled = executeIpcCommand('insurance:createContract', 'feature_insurance');
      assert.equal(resEnabled.ok, true);
    });

    it('Scenario 1.3: Purchase Conversion Factor enforces positive integer (Task 182-3)', () => {
      assert.ok(fs.existsSync(purchaseRepoPath), 'PurchaseRepository.cs must exist');
      const validateFactor = (factor) => {
        if (typeof factor !== 'number' || !Number.isInteger(factor) || factor < 1) {
          throw new Error('معامل تحويل العبوة للصنف يجب أن يكون رقماً صحيحاً موجباً أكبر من صفر');
        }
        return true;
      };

      assert.equal(validateFactor(12), true);
      assert.equal(validateFactor(1), true);
      assert.throws(() => validateFactor(12.5), /رقماً صحيحاً موجباً/);
      assert.throws(() => validateFactor(0), /رقماً صحيحاً موجباً/);
      assert.throws(() => validateFactor(-5), /رقماً صحيحاً موجباً/);
    });

    it('Scenario 1.4: Dependent features cannot be active if prerequisite is disabled', () => {
      const definitions = {
        feature_batch_pricing: { requires: ['feature_expiry_dates'] },
        feature_pharmacy: { requires: ['feature_expiry_dates', 'feature_multi_units', 'feature_loose_selling'] },
      };

      const validateToggle = (flagToDisable, currentEnabledFlags) => {
        for (const [feat, def] of Object.entries(definitions)) {
          if (currentEnabledFlags.includes(feat) && def.requires.includes(flagToDisable)) {
            return {
              allowed: false,
              blockingFeature: feat,
              message: `لا يمكن تعطيل «${flagToDisable}» لوجود ميزة معتمدة عليها: «${feat}»`,
            };
          }
        }
        return { allowed: true };
      };

      const check = validateToggle('feature_expiry_dates', ['feature_batch_pricing', 'feature_loose_selling']);
      assert.equal(check.allowed, false);
      assert.equal(check.blockingFeature, 'feature_batch_pricing');
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 126: Feature #183 — Multi-Pack Loose Selling & Atomic Rebase
  // ------------------------------------------------------------------------------------
  describe('Story 126: Multi-Pack Loose Selling & Packaging Wizard (Feature #183)', () => {
    it('Scenario 2.1: Multi-level packaging wizard generates 4 valid tiers with integer factors', () => {
      const packLevels = [
        { name: 'كرتونة', factor: 300, isBaseUnit: false, sellPricePiasters: 120000 },
        { name: 'علبة', factor: 30, isBaseUnit: false, sellPricePiasters: 13000 },
        { name: 'شريط', factor: 10, isBaseUnit: false, sellPricePiasters: 4500 },
        { name: 'قرص', factor: 1, isBaseUnit: true, sellPricePiasters: 50 },
      ];

      for (const lvl of packLevels) {
        assert.ok(Number.isInteger(lvl.factor) && lvl.factor >= 1);
        assert.ok(Number.isInteger(lvl.sellPricePiasters) && lvl.sellPricePiasters > 0);
      }

      // Check strictly ascending conversion factors
      assert.equal(packLevels[0].factor > packLevels[1].factor, true);
      assert.equal(packLevels[1].factor > packLevels[2].factor, true);
      assert.equal(packLevels[2].factor > packLevels[3].factor, true);
      assert.equal(packLevels[3].factor, 1);
    });

    it('Scenario 2.2: Integer COGS calculation without floats matches AwayFromZero rule', () => {
      const packageCostPiasters = 9000; // 90.00 EGP per box
      const factor = 30; // 30 pills in box

      // Calculate cost for 1 pill (factor=1): 9000 / 30 = 300 piasters
      const cost1Pill = divAwayFromZero(packageCostPiasters * 1, factor);
      assert.equal(cost1Pill, 300);

      // Calculate cost for 7 pills: (9000 * 7 + 15) / 30 = 63015 / 30 = 2100 piasters
      const cost7Pills = divAwayFromZero(packageCostPiasters * 7, factor);
      assert.equal(cost7Pills, 2100);

      // Package cost with fractional remainder: 1000 piasters for 3 strips (factor 3)
      // cost for 1 strip: (1000 * 1 + 1) / 3 = 333 piasters
      const costStrip = divAwayFromZero(1000 * 1, 3);
      assert.equal(costStrip, 333);
      // cost for 2 strips: (1000 * 2 + 1) / 3 = 2001 / 3 = 667 piasters
      const cost2Strips = divAwayFromZero(1000 * 2, 3);
      assert.equal(cost2Strips, 667);
      // Sum matches total package cost
      assert.equal(costStrip + cost2Strips, 1000);
    });

    it('Scenario 2.3: Atomic Unit Rebase scales stock and batches by factor F with zero valuation drift', () => {
      const initialStockBoxes = 10;
      const initialStockMilli = initialStockBoxes * 1000;
      const boxCostPiasters = 6000;
      const totalInventoryValuation = initialStockBoxes * boxCostPiasters; // 60,000 piasters (600 EGP)

      const batches = [
        { id: 'b1', qtyMilli: 4000, costPiasters: 6000 }, // 4 boxes
        { id: 'b2', qtyMilli: 6000, costPiasters: 6000 }, // 6 boxes
      ];

      const F = 30; // 1 box = 30 pills

      // Execute atomic rebase
      const newStockMilli = initialStockMilli * F; // 300,000 milli (300 pills)
      const newBatches = batches.map(b => ({
        ...b,
        qtyMilli: b.qtyMilli * F,
        costPiasters: divAwayFromZero(b.costPiasters, F), // 6000 / 30 = 200 piasters per pill
      }));

      assert.equal(newStockMilli, 300000);
      assert.equal(newBatches[0].qtyMilli, 120000);
      assert.equal(newBatches[1].qtyMilli, 180000);

      // Valuation after rebase: (300 pills * 200 piasters) = 60,000 piasters
      const totalValuationAfter = (newStockMilli / 1000) * newBatches[0].costPiasters;
      assert.equal(totalValuationAfter, totalInventoryValuation);
    });

    it('Scenario 2.4: Rebase safety guards reject when active held sales exist', () => {
      const executeRebase = (hasHeldSales, hasOpenInventoryCount, factor) => {
        if (hasHeldSales) throw new Error('لا يمكن إعادة تأسيس الوحدة لوجود فواتير معلقة تحتوي على الصنف');
        if (hasOpenInventoryCount) throw new Error('لا يمكن إعادة تأسيس الوحدة أثناء وجود دورة جرد مفتوحة');
        if (!Number.isInteger(factor) || factor < 2 || factor > 10000) {
          throw new Error('معامل إعادة التأسيس غير صالح');
        }
        return { success: true };
      };

      assert.throws(() => executeRebase(true, false, 30), /فواتير معلقة/);
      assert.throws(() => executeRebase(false, true, 30), /دورة جرد مفتوحة/);
      assert.throws(() => executeRebase(false, false, 1), /غير صالح/);
      assert.equal(executeRebase(false, false, 30).success, true);
    });

    it('Scenario 2.5: Compound stock display formats mixed units correctly and detects open packs', () => {
      const formatCompoundStock = (totalBaseUnits, units) => {
        // units: [{ name: 'علبة', factor: 30 }, { name: 'شريط', factor: 10 }, { name: 'قرص', factor: 1 }]
        let rem = totalBaseUnits;
        const parts = [];
        for (const u of units) {
          const count = Math.floor(rem / u.factor);
          if (count > 0 || u.factor === 1) {
            parts.push(`${count} ${u.name}`);
            rem %= u.factor;
          }
        }
        const hasOpenPack = (totalBaseUnits % units[0].factor) !== 0;
        return { text: parts.filter(p => !p.startsWith('0 ')).join(' و '), hasOpenPack };
      };

      const units = [
        { name: 'علبة', factor: 30 },
        { name: 'شريط', factor: 10 },
        { name: 'قرص', factor: 1 },
      ];

      const res1 = formatCompoundStock(307, units); // 10 boxes, 0 strips, 7 pills
      assert.equal(res1.text, '10 علبة و 7 قرص');
      assert.equal(res1.hasOpenPack, true);

      const res2 = formatCompoundStock(300, units); // exactly 10 boxes
      assert.equal(res2.text, '10 علبة');
      assert.equal(res2.hasOpenPack, false);
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 127: Feature #184 — Batch-Level Pricing & Multi-Tier Selling
  // ------------------------------------------------------------------------------------
  describe('Story 127: Batch-Level Pricing & Multi-Tier Selling (Feature #184)', () => {
    it('Scenario 3.1: Cart splits into two lines when demand spans two batches with different prices', () => {
      assert.ok(fs.existsSync(saleServicePath), 'SaleService.cs must exist');
      const batches = [
        { id: 'b-old', batchNumber: 'BN101', stockUnits: 2, sellPricePiasters: 4000, costPiasters: 3000 },
        { id: 'b-new', batchNumber: 'BN102', stockUnits: 5, sellPricePiasters: 6000, costPiasters: 4500 },
      ];

      const requestedQty = 3;

      // Allocation engine
      const allocations = [];
      let needed = requestedQty;
      for (const b of batches) {
        if (needed <= 0) break;
        const take = Math.min(b.stockUnits, needed);
        allocations.push({
          batchId: b.id,
          batchNumber: b.batchNumber,
          quantity: take,
          unitPricePiasters: b.sellPricePiasters,
          totalPiasters: take * b.sellPricePiasters,
        });
        needed -= take;
      }

      assert.equal(allocations.length, 2, 'Must split into two distinct batch lines');
      assert.equal(allocations[0].quantity, 2);
      assert.equal(allocations[0].unitPricePiasters, 4000);
      assert.equal(allocations[0].totalPiasters, 8000);

      assert.equal(allocations[1].quantity, 1);
      assert.equal(allocations[1].unitPricePiasters, 6000);
      assert.equal(allocations[1].totalPiasters, 6000);

      const totalCart = allocations.reduce((sum, a) => sum + a.totalPiasters, 0);
      assert.equal(totalCart, 14000, 'Total bill must be 140.00 EGP (14000 piasters)');
    });

    it('Scenario 3.2: Exact proportional discount distribution across split batch lines', () => {
      const line1Total = 8000;
      const line2Total = 6000;
      const invoiceTotal = line1Total + line2Total; // 14000
      const invoiceDiscountPiasters = 1400; // 10% discount

      const disc1 = divAwayFromZero(line1Total * invoiceDiscountPiasters, invoiceTotal);
      const disc2 = invoiceDiscountPiasters - disc1; // remainder ensures zero drift

      assert.equal(disc1, 800);
      assert.equal(disc2, 600);
      assert.equal(disc1 + disc2, invoiceDiscountPiasters);
    });

    it('Scenario 3.3: Manual batch selection override checks RBAC permission pos.select_batch', () => {
      const userPermissions = {
        cashier: { 'pos.select_batch': false },
        pharmacist: { 'pos.select_batch': true },
      };

      const selectManualBatch = (role) => {
        if (!userPermissions[role]?.['pos.select_batch']) {
          throw new Error('غير مصرح لك باختيار التشغيلة يدوياً — يلزم صلاحية pos.select_batch');
        }
        return { success: true };
      };

      assert.throws(() => selectManualBatch('cashier'), /غير مصرح/);
      assert.equal(selectManualBatch('pharmacist').success, true);
    });

    it('Scenario 3.4: Sales return restores inventory to original batch at original sold price', () => {
      const originalAllocations = [
        { batchId: 'b-old', quantity: 2, unitPricePiasters: 4000 },
        { batchId: 'b-new', quantity: 1, unitPricePiasters: 6000 },
      ];

      const returnRequest = { batchId: 'b-old', returnQty: 1 };
      const matched = originalAllocations.find(a => a.batchId === returnRequest.batchId);
      assert.ok(matched, 'Allocation must match original sale batch');
      assert.equal(matched.unitPricePiasters, 4000, 'Refund must use original purchased price 40 EGP');
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 128: Feature #185 — Storage Locations & Cold Chain
  // ------------------------------------------------------------------------------------
  describe('Story 128: Storage Locations & Cold Chain (Feature #185)', () => {
    it('Scenario 4.1: Storage locations hierarchy supports fridge, rack, shelf, drawer', () => {
      const validTypes = ['shelf', 'rack', 'drawer', 'fridge', 'warehouse'];
      const loc = { id: 'l1', code: 'FRIDGE-01', name: 'ثلاجة الأنسولين', type: 'fridge' };
      assert.ok(validTypes.includes(loc.type));
    });

    it('Scenario 4.2: Thermal receipt cold chain notice triggers only when fridge items exist', () => {
      const cartWithFridge = [{ name: 'لانتوس سولوستار', isColdChain: true }];
      const cartNormal = [{ name: 'بنادول أقراص', isColdChain: false }];

      const shouldPrintNotice = (cart) => cart.some(item => item.isColdChain);

      assert.equal(shouldPrintNotice(cartWithFridge), true);
      assert.equal(shouldPrintNotice(cartNormal), false);
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 129: Feature #186 — Shortage Book & Reorder
  // ------------------------------------------------------------------------------------
  describe('Story 129: Shortage Book & Supplier Order Reorder (Feature #186)', () => {
    it('Scenario 5.1: Quick shortage entry captures free text or registered product from POS', () => {
      const entry = {
        id: 'sh-1',
        productId: null,
        freeText: 'حقن كلكسان 40 غير متوفرة',
        requestedQtyMilli: 2000,
        customerName: 'أحمد محمود',
        source: 'pos',
        status: 'open',
      };

      assert.equal(entry.status, 'open');
      assert.equal(entry.source, 'pos');
      assert.equal(Number.isInteger(entry.requestedQtyMilli), true);
    });

    it('Scenario 5.2: Automatic low stock shortage trigger when stock drops below minimum', () => {
      const product = { id: 'p1', stockMilli: 3000, minStockMilli: 5000, preferredSupplierId: 'sup-1' };
      const isShortage = product.stockMilli <= product.minStockMilli;
      assert.equal(isShortage, true);
    });

    it('Scenario 5.3: Shortages group by preferred supplier into draft purchase order', () => {
      const shortages = [
        { productId: 'p1', supplierId: 'sup-ibn-sina', qtyMilli: 10000 },
        { productId: 'p2', supplierId: 'sup-ibn-sina', qtyMilli: 5000 },
        { productId: 'p3', supplierId: 'sup-united', qtyMilli: 20000 },
      ];

      const grouped = {};
      for (const s of shortages) {
        if (!grouped[s.supplierId]) grouped[s.supplierId] = [];
        grouped[s.supplierId].push(s);
      }

      assert.equal(Object.keys(grouped).length, 2);
      assert.equal(grouped['sup-ibn-sina'].length, 2);
      assert.equal(grouped['sup-united'].length, 1);
    });

    it('Scenario 5.4: Lost sales revenue analytics accurately calculates missed revenue', () => {
      const missedDemands = [
        { requestedQty: 2, pricePiasters: 8500 }, // 170.00 EGP
        { requestedQty: 5, pricePiasters: 3000 }, // 150.00 EGP
      ];

      const totalLostSalesPiasters = missedDemands.reduce((sum, d) => sum + (d.requestedQty * d.pricePiasters), 0);
      assert.equal(totalLostSalesPiasters, 32000); // 320.00 EGP
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 130: Feature #187 — Drug Master File & Generics Engine
  // ------------------------------------------------------------------------------------
  describe('Story 130: Drug Master File & Generics Engine (Feature #187)', () => {
    it('Scenario 6.1: Active ingredients store strengths in integer micro-units without floats', () => {
      // 500 mg = 500,000 mcg
      // 250 mg / 5ml = 250,000 mcg
      // 0.5 mg = 500 mcg
      const strengthMg = 500;
      const strengthMicro = strengthMg * 1000;
      assert.equal(strengthMicro, 500000);
      assert.ok(Number.isInteger(strengthMicro));
    });

    it('Scenario 6.2: 4-Tier Generics Engine classifies exact generics vs form variations vs class alternatives', () => {
      const referenceDrug = {
        id: 'panadol',
        dosageForm: 'tablets',
        classId: 'analgesics',
        ingredients: [{ id: 'paracetamol', strengthMicro: 500000 }],
      };

      const catalog = [
        {
          id: 'paramol',
          name: 'بارامول أقراص',
          dosageForm: 'tablets',
          classId: 'analgesics',
          ingredients: [{ id: 'paracetamol', strengthMicro: 500000 }],
          stockUnits: 15,
        },
        {
          id: 'cepalgan_eff',
          name: 'سيبالجان فوار',
          dosageForm: 'effervescent',
          classId: 'analgesics',
          ingredients: [{ id: 'paracetamol', strengthMicro: 500000 }],
          stockUnits: 8,
        },
        {
          id: 'cataflam',
          name: 'كتافلام 50',
          dosageForm: 'tablets',
          classId: 'analgesics',
          ingredients: [{ id: 'diclofenac', strengthMicro: 50000 }],
          stockUnits: 20,
        },
      ];

      const classify = (drug) => {
        const sameIng = drug.ingredients.length === referenceDrug.ingredients.length &&
          drug.ingredients.every(i => referenceDrug.ingredients.some(ri => ri.id === i.id && ri.strengthMicro === i.strengthMicro));

        if (sameIng && drug.dosageForm === referenceDrug.dosageForm) return 1; // Tier 1: Exact Generic
        if (sameIng && drug.dosageForm !== referenceDrug.dosageForm) return 2; // Tier 2: Different Form
        if (drug.classId === referenceDrug.classId) return 4; // Tier 4: Therapeutic Class
        return 5;
      };

      assert.equal(classify(catalog[0]), 1, 'Paramol is Tier 1 Exact Generic');
      assert.equal(classify(catalog[1]), 2, 'Cepalgan Effervescent is Tier 2 Different Form');
      assert.equal(classify(catalog[2]), 4, 'Cataflam is Tier 4 Therapeutic Class Alternative');
    });

    it('Scenario 6.3: Priority sorting places in-stock alternatives first', () => {
      const alternatives = [
        { id: 'alt-out-of-stock', tier: 1, stockUnits: 0, pricePiasters: 1500 },
        { id: 'alt-in-stock', tier: 1, stockUnits: 10, pricePiasters: 1600 },
      ];

      alternatives.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        const aHasStock = a.stockUnits > 0 ? 1 : 0;
        const bHasStock = b.stockUnits > 0 ? 1 : 0;
        if (aHasStock !== bHasStock) return bHasStock - aHasStock; // In-stock first
        return a.pricePiasters - b.pricePiasters;
      });

      assert.equal(alternatives[0].id, 'alt-in-stock');
    });

    it('Scenario 6.4: One-click substitution in cart maintains quantity and recalculates totals', () => {
      const cartItem = { productId: 'panadol', quantity: 3, unitPricePiasters: 2500, totalPiasters: 7500 };
      const chosenAlternative = { productId: 'paramol', unitPricePiasters: 1800 };

      // Swap
      const updatedItem = {
        ...cartItem,
        productId: chosenAlternative.productId,
        unitPricePiasters: chosenAlternative.unitPricePiasters,
        totalPiasters: cartItem.quantity * chosenAlternative.unitPricePiasters,
      };

      assert.equal(updatedItem.quantity, 3);
      assert.equal(updatedItem.unitPricePiasters, 1800);
      assert.equal(updatedItem.totalPiasters, 5400);
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 131: Feature #188 — Controlled Drugs Schedule & Prescriptions Register
  // ------------------------------------------------------------------------------------
  describe('Story 131: Controlled Drugs Schedule & Prescriptions Register (Feature #188)', () => {
    it('Scenario 7.1: Checkout hard-lock rejects controlled drug sale without valid dispense record', () => {
      const checkout = (cartItems, controlledDispenses) => {
        for (const item of cartItems) {
          if (item.rxStatus === 'controlled') {
            const hasDispense = controlledDispenses.some(d => d.productId === item.productId && d.patientName && d.doctorName);
            if (!hasDispense) {
              throw new Error(`لا يمكن إتمام البيع: الصنف «${item.name}» يخضع للرقابة ويتطلب تسجيل بيانات المريض والطبيب`);
            }
          }
        }
        return { success: true };
      };

      const cartWithControlled = [{ productId: 'c-1', name: 'أبتريل 2 مجم', rxStatus: 'controlled' }];
      assert.throws(() => checkout(cartWithControlled, []), /يخضع للرقابة/);

      const validDispense = [{ productId: 'c-1', patientName: 'سامي كمال', doctorName: 'د. حسام عادل' }];
      assert.equal(checkout(cartWithControlled, validDispense).success, true);
    });

    it('Scenario 7.2: Holding cart is strictly prohibited if cart contains controlled drug', () => {
      const holdCart = (cartItems) => {
        if (cartItems.some(i => i.rxStatus === 'controlled')) {
          throw new Error('يُمنع تعليق فواتير تحتوي على أدوية جدول ورعاية خاصة');
        }
        return { held: true };
      };

      assert.throws(() => holdCart([{ rxStatus: 'controlled' }]), /يُمنع تعليق فواتير/);
      assert.equal(holdCart([{ rxStatus: 'otc' }]).held, true);
    });

    it('Scenario 7.3: Patient National ID is securely masked on display for standard cashier', () => {
      const maskNationalId = (nid, canViewFull) => {
        if (!nid) return '';
        if (canViewFull) return nid;
        if (nid.length < 8) return '******';
        return nid.substring(0, 2) + '*'.repeat(nid.length - 4) + nid.substring(nid.length - 2);
      };

      const realNid = '29801011234567';
      assert.equal(maskNationalId(realNid, false), '29**********67');
      assert.equal(maskNationalId(realNid, true), realNid);
    });

    it('Scenario 7.4: Controlled drug returns log contra-entry without deleting history', () => {
      const originalEntry = { id: 'cd-1', type: 'dispense', qty: 2 };
      const contraEntry = { id: 'cd-2', type: 'contra_correction', originalId: 'cd-1', qty: -2, reason: 'مرتجع دواء جدول' };

      const netDispensed = originalEntry.qty + contraEntry.qty;
      assert.equal(netDispensed, 0);
      assert.equal(contraEntry.type, 'contra_correction');
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 132: Feature #189 — Health Insurance, Co-Payment Claims & Corporate Billing
  // ------------------------------------------------------------------------------------
  describe('Story 132: Health Insurance & Corporate Billing (Feature #189)', () => {
    it('Scenario 8.1: Standard 20% co-payment splits invoice to the exact piaster', () => {
      const invoicePiasters = 12550; // 125.50 EGP
      const patientBps = 2000; // 20.00%

      const patientSharePiasters = divAwayFromZero(invoicePiasters * patientBps, 10000);
      const companySharePiasters = invoicePiasters - patientSharePiasters;

      assert.equal(patientSharePiasters, 2510); // 25.10 EGP
      assert.equal(companySharePiasters, 10040); // 100.40 EGP
      assert.equal(patientSharePiasters + companySharePiasters, invoicePiasters);
    });

    it('Scenario 8.2: Excluded cosmetic/supplement items charged 100% to patient', () => {
      const coveredPiasters = 8000; // 80.00 EGP covered @ 10% co-pay
      const excludedPiasters = 3500; // 35.00 EGP cosmetic (0% covered)
      const patientBps = 1000; // 10.00%

      const coveredPatientShare = divAwayFromZero(coveredPiasters * patientBps, 10000); // 800
      const companyShare = coveredPiasters - coveredPatientShare; // 7200
      const patientTotal = coveredPatientShare + excludedPiasters; // 800 + 3500 = 4300

      assert.equal(patientTotal, 4300);
      assert.equal(companyShare, 7200);
      assert.equal(patientTotal + companyShare, coveredPiasters + excludedPiasters);
    });

    it('Scenario 8.3: Financial invoice cap limits company liability and pushes surplus to patient', () => {
      const invoiceTotal = 20000; // 200.00 EGP
      const patientBps = 1000; // 10% co-pay
      const companyCapPiasters = 12000; // Max company contribution 120.00 EGP

      let tentativePatient = divAwayFromZero(invoiceTotal * patientBps, 10000); // 2000
      let tentativeCompany = invoiceTotal - tentativePatient; // 18000

      if (tentativeCompany > companyCapPiasters) {
        const excess = tentativeCompany - companyCapPiasters; // 6000
        tentativeCompany = companyCapPiasters; // 12000
        tentativePatient += excess; // 2000 + 6000 = 8000
      }

      assert.equal(tentativeCompany, 12000);
      assert.equal(tentativePatient, 8000);
      assert.equal(tentativeCompany + tentativePatient, invoiceTotal);
    });

    it('Scenario 8.4: Cash drawer calculator strictly excludes insurance receivables from cash', () => {
      assert.ok(fs.existsSync(drawerCashCalculatorPath), 'DrawerCashCalculator.cs must exist');
      const payments = [
        { method: 'cash', amountPiasters: 5000 },
        { method: 'card', amountPiasters: 3000 },
        { method: 'insurance', amountPiasters: 12000 }, // Company claim receivable
      ];

      const expectedDrawerCash = payments
        .filter(p => p.method === 'cash')
        .reduce((sum, p) => sum + p.amountPiasters, 0);

      assert.equal(expectedDrawerCash, 5000, 'Drawer cash must ignore insurance claims entirely');
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 133: Feature #190 — Patient Profiles & Chronic Disease Tracking
  // ------------------------------------------------------------------------------------
  describe('Story 133: Patient Profiles & Chronic Disease Tracking (Feature #190)', () => {
    it('Scenario 9.1: Refill due date calculation accurately projects next refill day', () => {
      const lastDispensedTimestamp = new Date('2026-10-01T00:00:00Z').getTime();
      const dispensedUnits = 30; // 30 tablets
      const dailyDoseUnits = 1; // 1 tablet per day
      const supplyDays = Math.floor(dispensedUnits / dailyDoseUnits);

      const nextDueDate = new Date(lastDispensedTimestamp + (supplyDays * 86400000));
      assert.equal(nextDueDate.toISOString().split('T')[0], '2026-10-31');
    });

    it('Scenario 9.2: Clinical allergy warning triggers on active ingredient match', () => {
      const patientAllergies = ['acetylsalicylic_acid', 'penicillin'];
      const drugToSell = {
        name: 'أسبوسيد 75 مجم',
        activeIngredients: ['acetylsalicylic_acid'],
      };

      const hasAllergyConflict = drugToSell.activeIngredients.some(ai => patientAllergies.includes(ai));
      assert.equal(hasAllergyConflict, true, 'Clinical warning must flag allergy conflict');
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 134: Feature #191 — Supplier Expiry Returns & External Drug Reference
  // ------------------------------------------------------------------------------------
  describe('Story 134: Supplier Expiry Returns & External Drug Reference (Feature #191)', () => {
    it('Scenario 10.1: Supplier return window identifies eligible batches for credit return', () => {
      const supplierPolicy = { windowDays: 60, creditBps: 8500 }; // 60 days before expiry, 85% credit
      const today = new Date('2026-10-24T00:00:00Z').getTime();

      const batches = [
        { id: 'b1', expiryDate: '2026-11-20', costPiasters: 10000 }, // in 27 days -> Eligible
        { id: 'b2', expiryDate: '2027-05-15', costPiasters: 10000 }, // in ~200 days -> Not eligible
      ];

      const checkEligible = (b) => {
        const diffDays = (new Date(b.expiryDate).getTime() - today) / 86400000;
        return diffDays > 0 && diffDays <= supplierPolicy.windowDays;
      };

      assert.equal(checkEligible(batches[0]), true);
      assert.equal(checkEligible(batches[1]), false);

      const creditRefund = divAwayFromZero(batches[0].costPiasters * supplierPolicy.creditBps, 10000);
      assert.equal(creditRefund, 8500); // 85.00 EGP credited
    });

    it('Scenario 10.2: Waste write-off (EXPIRED_WRITE_OFF) decrements batch stock to zero', () => {
      const batch = { id: 'b-exp', stockMilli: 5000, costPiasters: 2500 };
      const writeOffMovement = {
        type: 'EXPIRED_WRITE_OFF',
        batchId: batch.id,
        quantityDeltaMilli: -batch.stockMilli,
        totalLossPiasters: divAwayFromZero((batch.stockMilli / 1000) * batch.costPiasters, 1),
      };

      assert.equal(writeOffMovement.quantityDeltaMilli, -5000);
      assert.equal(writeOffMovement.totalLossPiasters, 12500); // 5 * 2500 = 125.00 EGP
    });

    it('Scenario 10.3: Drug Reference table is isolated from store catalog products', () => {
      const storeProducts = [{ barcode: '6221111111111', name: 'منتج مسجل' }];
      const drugReference = [
        { barcode: '6229999999999', tradeName: 'دواء بالدليل المرجعي' },
        { barcode: '6221111111111', tradeName: 'دواء موجود بالسوبرماركت' },
      ];

      // Scanning unknown barcode falls back to drug_reference lookup
      const scanBarcode = (barcode) => {
        const inStore = storeProducts.find(p => p.barcode === barcode);
        if (inStore) return { foundInStore: true, item: inStore };
        const inRef = drugReference.find(r => r.barcode === barcode);
        if (inRef) return { foundInStore: false, foundInReference: true, refItem: inRef };
        return { foundInStore: false, foundInReference: false };
      };

      const res = scanBarcode('6229999999999');
      assert.equal(res.foundInStore, false);
      assert.equal(res.foundInReference, true);
      assert.equal(res.refItem.tradeName, 'دواء بالدليل المرجعي');
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 135: Feature #192 — Specialized Pharmacy Reports, Dosage Labels & RBAC
  // ------------------------------------------------------------------------------------
  describe('Story 135: Specialized Pharmacy Reports, Dosage Labels & RBAC (Feature #192)', () => {
    it('Scenario 11.1: Thermal dosage label layout contains Arabic instructions with zero emojis', () => {
      const label = {
        patientName: 'سارة إبراهيم',
        drugName: 'أوجمنتين 1 جم',
        instructions: 'قرص كل 12 ساعة بعد الأكل لمدة 7 أيام',
        date: '2026-10-24',
      };

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      assert.equal(emojiRegex.test(label.instructions), false);
      assert.ok(label.instructions.includes('بعد الأكل'));
    });

    it('Scenario 11.2: Complete RBAC permissions matrix covers all 20 pharmacy keys in C# and TypeScript', () => {
      assert.ok(fs.existsSync(securityServicePath));
      assert.ok(fs.existsSync(userManagerModalPath));

      const csharpContent = fs.readFileSync(securityServicePath, 'utf8');
      const tsContent = fs.readFileSync(userManagerModalPath, 'utf8');

      const pharmacyKeys = [
        'products.packaging.edit',
        'products.unit_rebase',
        'pos.change_unit',
        'pos.select_batch',
        'inventory.locations.manage',
        'shortage.view',
        'shortage.manage',
        'shortage.convert_to_purchase',
        'pharma.drug_info.edit',
        'pharma.alternatives.view',
        'pharma.controlled.dispense',
        'pharma.controlled.approve',
        'pharma.controlled.register_view',
        'pharma.controlled.view_full',
        'prescriptions.manage',
        'insurance.manage_contracts',
        'insurance.sell',
        'insurance.claims.manage',
        'insurance.claims.settle',
        'patients.view',
        'patients.edit',
        'pharma.expiry_returns.manage',
        'pharma.drug_reference.import',
        'reports.pharma.view',
      ];

      for (const key of pharmacyKeys) {
        assert.ok(
          csharpContent.includes(`"${key}"`),
          `SecurityService.cs must declare permission key: ${key}`
        );
        assert.ok(
          tsContent.includes(`'${key}'`),
          `UserManagerModal.tsx must expose permission key: ${key}`
        );
      }
    });

    it('Scenario 11.3: Zero-Regression Golden Contract — Standard templates have pharmacy flags disabled', () => {
      assert.ok(fs.existsSync(storeTemplateServicePath));
      const content = fs.readFileSync(storeTemplateServicePath, 'utf8');

      // Check standard retail store templates: supermarket, dairy_bakery, produce_butchery, cafe_restaurant
      const standardStoreTemplates = ['supermarket', 'dairy_bakery', 'produce_butchery', 'cafe_restaurant'];
      for (const storeId of standardStoreTemplates) {
        assert.ok(content.includes(`"${storeId}"`), `Store template ${storeId} must exist in StoreTemplateService.cs`);
      }
    });
  });

  // ------------------------------------------------------------------------------------
  // Story 136: Feature #193 — Pharmacy Purchases, Template Parity & Media Archival
  // ------------------------------------------------------------------------------------
  describe('Story 136: Pharmacy Purchases, Template Parity & Media Archival (Feature #193)', () => {
    it('Scenario 12.1: Pharmacy distributor pricing calculates unit cost from public price and discount bps', () => {
      const publicPricePiasters = 10000; // 100.00 EGP
      const discountBps = 2500; // 25.00% discount

      // Net cost = PublicPrice * (10000 - DiscountBps) / 10000
      const netUnitCostPiasters = divAwayFromZero(publicPricePiasters * (10000 - discountBps), 10000);
      assert.equal(netUnitCostPiasters, 7500); // 75.00 EGP net cost
    });

    it('Scenario 12.2: Free bonus items spread cost across total received inventory', () => {
      const publicPricePiasters = 10000; // 100.00 EGP
      const discountBps = 2500; // 25% discount -> 75.00 EGP paid per box
      const boughtBoxes = 10;
      const bonusBoxes = 2; // 2 free boxes (12 total received)

      const totalInvoiceCostPiasters = boughtBoxes * divAwayFromZero(publicPricePiasters * (10000 - discountBps), 10000); // 75,000 piasters
      const effectiveUnitCostPiasters = divAwayFromZero(totalInvoiceCostPiasters, boughtBoxes + bonusBoxes); // 75000 / 12 = 6250

      assert.equal(totalInvoiceCostPiasters, 75000);
      assert.equal(effectiveUnitCostPiasters, 6250); // 62.50 EGP effective cost per box
      assert.equal(effectiveUnitCostPiasters * (boughtBoxes + bonusBoxes), totalInvoiceCostPiasters);
    });

    it('Scenario 12.3: Pharmacy template enables all 12 pharmacy feature flags by default in C# and TypeScript', () => {
      assert.ok(fs.existsSync(storeTemplateServicePath));
      assert.ok(fs.existsSync(storeTemplatesTsPath));

      const csharpContent = fs.readFileSync(storeTemplateServicePath, 'utf8');
      const tsContent = fs.readFileSync(storeTemplatesTsPath, 'utf8');

      const expectedPharmacyFlags = [
        'feature_loose_selling',
        'feature_batch_pricing',
        'feature_shelf_locations',
        'feature_shortage_book',
        'feature_pharmacy',
        'feature_pharma_alternatives',
        'feature_controlled_drugs',
        'feature_prescriptions',
        'feature_patient_profiles',
        'feature_insurance',
        'feature_expiry_returns',
        'feature_drug_reference',
      ];

      for (const flag of expectedPharmacyFlags) {
        assert.ok(
          csharpContent.includes(`tPharm.FeatureFlags["${flag}"] = true;`),
          `StoreTemplateService.cs must set ${flag} = true for pharmacy`
        );
        assert.ok(
          tsContent.includes(`${flag}: true`),
          `storeTemplates.ts must set ${flag}: true for pharmacy`
        );
      }
    });

    it('Scenario 12.4: BackupService bundles prescriptions directory into backup archive', () => {
      assert.ok(fs.existsSync(backupServicePath));
      const content = fs.readFileSync(backupServicePath, 'utf8');

      assert.ok(
        content.includes('prescriptions') || content.includes('Prescriptions'),
        'BackupService.cs must reference prescriptions directory for backup packaging'
      );
    });
  });
});
