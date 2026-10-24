import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * اختبارات إجهاد وسيناريوهات واقعية معقدة لنظام بيع الفرط والتعبئة المتعددة (Multi-Unit & Loose Selling)
 * - سوبرماركت: السجائر (قاروصة / علبة / سيجارة فرط)، البسكويت والكراتين.
 * - صيدلية: الأدوية (علبة / شريط / قرص فرط)، أكياس الفوار، والمضادات.
 * - حظر الفرط (isLooseSellable = false).
 * - مرتجعات الفرط الجزئية.
 * - معادلات التسعير والتقريب البنكي بالقروش.
 * - محاكاة مونت كارلو لمطابقة قانون حفظ المخزون والمالية (Zero Drift Invariant).
 */

describe('اختبارات الإجهاد الشاملة لبيع الفرط والوحدات المتعددة (Loose & Multi-Units Battle-Test)', () => {

  // دوال محاكاة مطابقة 100% لخوارزميات C# في الـ Backend
  const applyPriceRounding = (piasters, roundTo, premiumBps) => {
    let price = piasters;
    if (premiumBps > 0) {
      price = Math.round(price * (1 + premiumBps / 10000));
    }
    if (roundTo <= 0) return price;
    return Math.ceil(price / roundTo) * roundTo;
  };

  const calculateUnitProfit = (sellPricePiasters, costPricePiasters) => {
    const profitPiasters = sellPricePiasters - costPricePiasters;
    const marginPercent = costPricePiasters > 0
      ? Math.round((profitPiasters / costPricePiasters) * 100)
      : 0;
    return { profitPiasters, marginPercent };
  };

  // --------------------------------------------------------------------------
  // السيناريو الأول: سوبرماركت - بيع السجائر (قاروصة / علبة / سيجارة فرط)
  // --------------------------------------------------------------------------
  describe('1. سيناريو السوبرماركت الواقعي: تجزئة السجائر (قاروصة / علبة / سيجارة فرط)', () => {
    const cigaretteProduct = {
      id: 'prod_cleopatra_box',
      name: 'سجائر كليوباترا بوكس أصفر',
      barcode: '6221000998877',
      unit: 'piece', // وحدة الأساس هي السيجارة
      stockQuantityMilli: 0, // يبدأ المخزن بصفر
      pricePiasters: 225, // سعر السيجارة الفرط: 2.25 ج.م (225 قرش)
      costPiasters: 185,  // تكلفة السيجارة الواحدة: 1.85 ج.م (185 قرش)
      isLooseSellable: true,
      units: [
        {
          id: 'unit_single_ciga',
          unitName: 'سيجارة',
          conversionFactor: 1,
          isBaseUnit: true,
          sellPricePiasters: 225, // 2.25 ج.م
          costPricePiasters: 185, // 1.85 ج.م
          barcode: 'CIGA_LOOSE_01',
          isDivisible: false
        },
        {
          id: 'unit_pack_box',
          unitName: 'علبة 20 سيجارة',
          conversionFactor: 20,
          isBaseUnit: false,
          sellPricePiasters: 4000, // 40.00 ج.م للعلبة (توفير مقارنة بـ 20 × 2.25 = 45 ج.م)
          costPricePiasters: 3700, // 37.00 ج.م تكلفة العلبة (1.85 × 20)
          barcode: '6221000998877', // باركود العلبة التجاري
          isDivisible: false
        },
        {
          id: 'unit_carton_pack',
          unitName: 'قاروصة 10 علب',
          conversionFactor: 200, // 10 علب × 20 = 200 سيجارة
          isBaseUnit: false,
          sellPricePiasters: 39000, // 390.00 ج.م للقاروصة
          costPricePiasters: 36000, // 360.00 ج.م تكلفة القاروصة بالجملة
          barcode: '6221000998800',
          isDivisible: false
        }
      ]
    };

    it('1.1 شراء 5 قوارص يضيف 1000 سيجارة بدقة إلى المخزن بوحدة الملي (1,000,000 milli)', () => {
      const purchaseQtyCartons = 5;
      const cartonUnit = cigaretteProduct.units.find(u => u.unitName.includes('قاروصة'));
      assert.ok(cartonUnit, 'وحدة القاروصة يجب أن تكون معرفة');

      // 5 قوارص × 200 سيجارة × 1000 ملي = 1,000,000 milli
      const baseAddedMilli = Math.round(purchaseQtyCartons * cartonUnit.conversionFactor * 1000);
      assert.equal(baseAddedMilli, 1000000, 'يجب أن تعادل 5 قوارص 1,000,000 مليجرام/ملي وحدة');

      cigaretteProduct.stockQuantityMilli += baseAddedMilli;
      assert.equal(cigaretteProduct.stockQuantityMilli, 1000000);
      assert.equal(cigaretteProduct.stockQuantityMilli / 1000, 1000, 'الرصيد الفعلي = 1000 سيجارة في المحل');
    });

    it('1.2 بيع متعدد في نفس اليوم (1 قاروصة + 4 علب + 7 سجائر فرط) يخصم المخزن بدقة تامة', () => {
      const sales = [
        { unitName: 'قاروصة', factor: 200, qty: 1, unitPrice: 39000, unitCost: 36000 },
        { unitName: 'علبة', factor: 20, qty: 4, unitPrice: 4000, unitCost: 3700 },
        { unitName: 'سيجارة فرط', factor: 1, qty: 7, unitPrice: 225, unitCost: 185 },
      ];

      let totalDeductionMilli = 0;
      let totalRevenuePiasters = 0;
      let totalCostPiasters = 0;

      for (const s of sales) {
        const itemDeductionMilli = s.qty * s.factor * 1000;
        totalDeductionMilli += itemDeductionMilli;
        totalRevenuePiasters += s.qty * s.unitPrice;
        totalCostPiasters += s.qty * s.unitCost;
      }

      // إجمالي السجائر المباعة:
      // 1 قاروصة (200) + 4 علب (80) + 7 فرط (7) = 287 سيجارة = 287,000 milli
      assert.equal(totalDeductionMilli, 287000, 'إجمالي السجائر المخصومة يجب أن يكون 287,000 ملي');
      assert.equal(totalRevenuePiasters, 39000 + (4 * 4000) + (7 * 225), 'مجموع الإيراد = 56,575 قرش (565.75 ج.م)');
      assert.equal(totalRevenuePiasters, 56575);

      // خصم من المخزن
      cigaretteProduct.stockQuantityMilli -= totalDeductionMilli;
      assert.equal(cigaretteProduct.stockQuantityMilli, 713000, 'المتبقي بالمخزن = 713 سيجارة بالضبط');

      // تفكيك الرصيد المتبقي (Display Representation):
      // 713 سيجارة = 3 قوارص (600) + 5 علب (100) + 13 سيجارة فرط
      const remainingTotal = cigaretteProduct.stockQuantityMilli / 1000;
      const fullCartons = Math.floor(remainingTotal / 200);
      const remAfterCartons = remainingTotal % 200;
      const fullPacks = Math.floor(remAfterCartons / 20);
      const loosePieces = remAfterCartons % 20;

      assert.equal(fullCartons, 3, 'المتبقي يعادل 3 قوارص');
      assert.equal(fullPacks, 5, 'و 5 علب كاملة');
      assert.equal(loosePieces, 13, 'و 13 سيجارة فرط فردانية');
      assert.equal((fullCartons * 200) + (fullPacks * 20) + loosePieces, 713);
    });

    it('1.3 هامش ربح الفرط أعلى من هامش ربح العلبة والقاروصة', () => {
      const looseProfit = calculateUnitProfit(225, 185);
      const packProfit = calculateUnitProfit(4000, 3700);
      const cartonProfit = calculateUnitProfit(39000, 36000);

      // بيع 20 سيجارة فرط يجلب أرباح: 20 × (225 - 185) = 800 قرش (8.00 ج.م)
      // بيع علبة واحدة مقفولة يجلب أرباح: 4000 - 3700 = 300 قرش (3.00 ج.م)
      assert.equal(looseProfit.profitPiasters * 20, 800, 'أرباح 20 سيجارة فرط = 8.00 ج.م');
      assert.equal(packProfit.profitPiasters, 300, 'أرباح علبة مقفولة = 3.00 ج.م');
      assert.ok(looseProfit.profitPiasters * 20 > packProfit.profitPiasters, 'ربح بيع العلبة مفكوكة أعلى من المقفولة');
      assert.equal(cartonProfit.profitPiasters, 3000, 'أرباح القاروصة المقفولة = 30.00 ج.م');
    });
  });

  // --------------------------------------------------------------------------
  // السيناريو الثاني: صيدلية - تجزئة المضادات الحيوية (علبة / شريط / قرص)
  // --------------------------------------------------------------------------
  describe('2. سيناريو الصيدلية الواقعي: بيع الأدوية بالشريط والقرص (علبة / شريط / قرص فرط)', () => {
    const antibiotic = {
      id: 'prod_augmentin_1g',
      name: 'أوجمنتين 1 جم 14 قرص',
      barcode: '6223001122334',
      unit: 'piece', // Base unit is 1 Tablet
      stockQuantityMilli: 0,
      pricePiasters: 750, // سعر القرص الواحد فرط: 7.50 ج.م (750 قرش)
      costPiasters: 550,  // تكلفة القرص: 5.50 ج.م (550 قرش)
      isLooseSellable: true,
      units: [
        {
          id: 'u_pill',
          unitName: 'قرص',
          conversionFactor: 1,
          isBaseUnit: true,
          sellPricePiasters: 750,
          costPricePiasters: 550,
          barcode: 'AUG_PILL',
          isDivisible: false
        },
        {
          id: 'u_blister',
          unitName: 'شريط (7 أقراص)',
          conversionFactor: 7,
          isBaseUnit: false,
          sellPricePiasters: 4800, // 48.00 ج.م للشريط
          costPricePiasters: 3850, // 38.50 ج.م تكلفة الشريط
          barcode: 'AUG_BLISTER',
          isDivisible: false
        },
        {
          id: 'u_box',
          unitName: 'علبة (شريطين = 14 قرص)',
          conversionFactor: 14,
          isBaseUnit: false,
          sellPricePiasters: 9100, // 91.00 ج.م للعلبة
          costPricePiasters: 7700, // 77.00 ج.م تكلفة العلبة
          barcode: '6223001122334',
          isDivisible: false
        }
      ]
    };

    it('2.1 استلام مشتريات 10 علب دواء برقم تشغيلة وتاريخ صلاحية', () => {
      const boxFactor = 14;
      const purchasedBoxes = 10;
      const totalPillsAdded = purchasedBoxes * boxFactor; // 140 أقراص
      const deltaMilli = totalPillsAdded * 1000;

      antibiotic.stockQuantityMilli += deltaMilli;
      assert.equal(antibiotic.stockQuantityMilli, 140000, 'الرصيد يجب أن يصبح 140,000 ملي (140 قرص)');
    });

    it('2.2 صرف روشتة (1 شريط + 3 أقراص فرط لمريض يحتاج جرعة 10 أيام)', () => {
      // المريض يحتاج 10 أقراص: الصيدلي يعطيه 1 شريط كامل (7 أقراص) + 3 أقراص فرط
      const itemsToDispense = [
        { unit: 'شريط', factor: 7, qty: 1, price: 4800 },
        { unit: 'قرص فرط', factor: 1, qty: 3, price: 750 },
      ];

      let pillsDeducted = 0;
      let invoiceTotalPiasters = 0;

      for (const item of itemsToDispense) {
        pillsDeducted += (item.qty * item.factor);
        invoiceTotalPiasters += (item.qty * item.price);
      }

      assert.equal(pillsDeducted, 10, 'المصروف الفعلي 10 أقراص بالضبط');
      assert.equal(invoiceTotalPiasters, 4800 + (3 * 750), 'إجمالي الفاتورة = 48.00 + 22.50 = 70.50 ج.م (7050 قرش)');
      assert.equal(invoiceTotalPiasters, 7050);

      antibiotic.stockQuantityMilli -= (pillsDeducted * 1000);
      assert.equal(antibiotic.stockQuantityMilli, 130000, 'المتبقي بالمخزن = 130 قرص (9 علب + 1 شريط)');

      const remainingPills = antibiotic.stockQuantityMilli / 1000;
      const remainingBoxes = Math.floor(remainingPills / 14);
      const remAfterBoxes = remainingPills % 14;
      const remainingBlisters = Math.floor(remAfterBoxes / 7);
      const remainingLoosePills = remAfterBoxes % 7;

      assert.equal(remainingBoxes, 9, 'المتبقي 9 علب مقفولة');
      assert.equal(remainingBlisters, 0, 'و 0 شريط كامل (لأن المتبقي 4 أقراص أقل من حجم الشريط 7)');
      assert.equal(remainingLoosePills, 4, 'و 4 أقراص فرط');
      assert.equal((9 * 14) + 4, 130);
    });
  });

  // --------------------------------------------------------------------------
  // السيناريو الثالث: سياسة حظر الفرط (isLooseSellable: false)
  // --------------------------------------------------------------------------
  describe('3. سياسة حظر البيع بالفرط (isLooseSellable = false Protection)', () => {
    const packagedItem = {
      id: 'prod_tea_100_bags',
      name: 'شاي فتلة فاخر عبوة 100 كيس',
      stockQuantityMilli: 500000, // 500 كيس في المخزن (5 علب)
      isLooseSellable: false, // ممنوع بيع الأكياس فرط في السوبرماركت
      units: [
        { id: 'u_bag', unitName: 'كيس فتلة', conversionFactor: 1, isBaseUnit: true, sellPricePiasters: 150 },
        { id: 'u_box100', unitName: 'علبة 100 فتلة', conversionFactor: 100, isBaseUnit: false, sellPricePiasters: 12000 }
      ]
    };

    it('3.1 عند محاولة بيع الوحدة الصغرى لصنف غير مصرح بفرطه يتم منع العملية في الكاشير', () => {
      const isAllowedToSellUnit = (product, unit) => {
        if (unit.isBaseUnit && product.isLooseSellable === false && product.units.length > 1) {
          return false; // ممنوع بيع الفرط
        }
        return true;
      };

      const baseUnit = packagedItem.units.find(u => u.isBaseUnit);
      const boxUnit = packagedItem.units.find(u => !u.isBaseUnit);

      assert.equal(isAllowedToSellUnit(packagedItem, baseUnit), false, 'بيع كيس الفتلة الفردي ممنوع');
      assert.equal(isAllowedToSellUnit(packagedItem, boxUnit), true, 'بيع العلبة الـ 100 كيس مسموح');
    });

    it('3.2 كارت الصنف في الكاشير يختار افتراضياً العبوة الكبرى المقفولة عند إغلاق الفرط', () => {
      const resolveDefaultCardUnit = (product) => {
        if (product.defaultSaleUnitId) {
          const found = product.units.find(u => u.id === product.defaultSaleUnitId);
          if (found) return found;
        }
        // إذا كان الفرط مغلقاً: يختار أكبر وحدة مقفولة تلقائياً
        if (product.isLooseSellable === false && product.units.length > 1) {
          const nonBase = product.units.filter(u => !u.isBaseUnit);
          return nonBase.sort((a, b) => b.conversionFactor - a.conversionFactor)[0];
        }
        return product.units.find(u => u.isBaseUnit) || product.units[0];
      };

      const resolved = resolveDefaultCardUnit(packagedItem);
      assert.equal(resolved.unitName, 'علبة 100 فتلة', 'الكاشير يعتمد العلبة المقفولة افتراضياً عند النقر');
      assert.equal(resolved.conversionFactor, 100);
    });
  });

  // --------------------------------------------------------------------------
  // السيناريو الرابع: مرتجع الفرط والعلب الجزئي (Partial Reversals)
  // --------------------------------------------------------------------------
  describe('4. سيناريو المرتجع الجزئي للفرط واستعادة رصيد المخزن بدقة', () => {
    it('4.1 إرجاع سيجارة فرط واحدة يستعيد 1,000 ملي فقط دون تضارب مع العلبة', () => {
      let currentStockMilli = 50000; // 50 سيجارة

      // زبون اشترى علبة (20 سيجارة = 20,000 ملي) وسيارتين فرط (2,000 ملي)
      currentStockMilli -= 22000;
      assert.equal(currentStockMilli, 28000, 'الرصيد بعد البيع = 28 سيجارة');

      // الزبون عاد وأرجع سيجارة فرط واحدة فقط سليمة
      const returnItem = {
        unitName: 'سيجارة',
        conversionFactor: 1,
        qty: 1,
        unitPricePiasters: 225
      };

      const restoredMilli = returnItem.qty * returnItem.conversionFactor * 1000;
      assert.equal(restoredMilli, 1000, 'المرتجع يستعيد 1,000 ملي فقط');

      currentStockMilli += restoredMilli;
      assert.equal(currentStockMilli, 29000, 'الرصيد استعاد سيجارة واحدة وأصبح 29 سيجارة بالضبط');

      // الزبون أرجع العلبة المقفولة أيضاً
      const returnBox = {
        unitName: 'علبة',
        conversionFactor: 20,
        qty: 1,
        unitPricePiasters: 4000
      };
      currentStockMilli += (returnBox.qty * returnBox.conversionFactor * 1000);
      assert.equal(currentStockMilli, 49000, 'المتبقي خارج المحل الآن سيجارة واحدة فقط مباعة');
    });
  });

  // --------------------------------------------------------------------------
  // السيناريو الخامس: معادلات تسعير الفرط والتقريب المالي الذكي (Smart Rounding)
  // --------------------------------------------------------------------------
  describe('5. معادلات التسعير الآلي للفرط وقواعد التقريب بالقروش', () => {
    it('5.1 التقريب لأقرب ربع جنيه (25 قرش) مع علاوة بيع مفكوك +10%', () => {
      // سعر العلبة 35.00 ج.م (3500 قرش)، فيها 20 سيجارة
      // السعر النظري للسيجارة = 3500 / 20 = 175 قرش
      // مع علاوة تجزئة +10% (1000 bps) = 175 * 1.1 = 192.5 قرش => 193 قرش
      // بالتقريب لأقرب 25 قرش: ceil(193 / 25) * 25 = 200 قرش (2.00 ج.م)
      const baseRawPrice = 175;
      const roundedPrice = applyPriceRounding(baseRawPrice, 25, 1000);
      assert.equal(roundedPrice, 200, 'السعر المحسوب يجب أن يكون 2.00 ج.م بالضبط');
    });

    it('5.2 التقريب لأقرب نصف جنيه (50 قرش) مع علاوة تجزئة +15%', () => {
      // سعر علبة بسكويت 12 قطعة بـ 50.00 ج.م (5000 قرش)
      // السعر النظري للقطعة = 5000 / 12 = 416.66 => 417 قرش
      // مع علاوة +15% (1500 bps) = 417 * 1.15 = 479.55 => 480 قرش
      // بالتقريب لأقرب 50 قرش: ceil(480 / 50) * 50 = 500 قرش (5.00 ج.م)
      const baseRawPrice = Math.round(5000 / 12);
      const roundedPrice = applyPriceRounding(baseRawPrice, 50, 1500);
      assert.equal(roundedPrice, 500, 'سعر القطعة الفرط يقرب لأقرب نصف جنيه (5.00 ج.م)');
    });

    it('5.3 تقريب بدون علاوة (متساوي) لأقرب قرش كامل (Zero Rounding)', () => {
      const price = applyPriceRounding(333, 0, 0);
      assert.equal(price, 333, 'بدون تقريب يظل السعر 333 قرش');
    });
  });

  // --------------------------------------------------------------------------
  // السيناريو السادس: اختبار الضغط العنيف (Monte-Carlo Invariant Stress - 10,000 Trans)
  // --------------------------------------------------------------------------
  describe('6. اختبار الحمل العنيف (Monte-Carlo Simulation: 10,000 حركة عشوائية للفرط)', () => {
    it('6.1 الحفاظ الرياضي المطلق على رصيد المخزن بالقروش والملي دون أي انحراف (Zero Drift Invariant)', () => {
      const initialStockPieces = 5000; // 5000 سيجارة / قطعة
      let currentStockMilli = initialStockPieces * 1000;

      let totalPurchasedPieces = 0;
      let totalSoldPieces = 0;
      let totalReturnedPieces = 0;

      let totalSalesPiasters = 0;
      let totalReturnsPiasters = 0;

      // معاملات التعبئة المتاحة
      const units = [
        { name: 'قاروصة', factor: 200, price: 39000 },
        { name: 'علبة', factor: 20, price: 4000 },
        { name: 'سيجارة فرط', factor: 1, price: 225 },
      ];

      // محاكاة 10,000 حركة تجارية عشوائية
      const ITERATIONS = 10000;
      for (let i = 0; i < ITERATIONS; i++) {
        const actionType = i % 10; // توزيع واقعي: 70% بيع، 20% شراء، 10% مرتجع

        if (actionType < 7) {
          // عملية بيع
          const unit = units[i % units.length];
          const qty = (i % 3) + 1; // 1 إلى 3 وحدات
          const neededMilli = qty * unit.factor * 1000;

          if (currentStockMilli >= neededMilli) {
            currentStockMilli -= neededMilli;
            totalSoldPieces += (qty * unit.factor);
            totalSalesPiasters += (qty * unit.price);
          }
        } else if (actionType < 9) {
          // عملية شراء
          const unit = units[i % 2]; // شراء كراتين أو علب فقط
          const qty = (i % 5) + 1;
          const addedMilli = qty * unit.factor * 1000;

          currentStockMilli += addedMilli;
          totalPurchasedPieces += (qty * unit.factor);
        } else {
          // عملية مرتجع
          const unit = units[i % units.length];
          const qty = 1;
          const returnedMilli = qty * unit.factor * 1000;

          currentStockMilli += returnedMilli;
          totalReturnedPieces += (qty * unit.factor);
          totalReturnsPiasters += (qty * unit.price);
        }
      }

      // فحص قانون حفظ المخزون الرياضي:
      // الرصيد النهائي = الابتدائي + المشتريات - المبيعات + المرتجعات
      const expectedPieces = initialStockPieces + totalPurchasedPieces - totalSoldPieces + totalReturnedPieces;
      const actualPieces = currentStockMilli / 1000;

      assert.equal(actualPieces, expectedPieces, 'قانون حفظ المخزون: الرصيد الفعلي يطابق تماماً مجموع الحركات بدون أي كسر أو ضياع');
      assert.equal(currentStockMilli % 1000, 0, 'المخزن لا يحتوي على أي كسور مليجرام مشوهة');

      // فحص الأعداد المالية:
      assert.ok(totalSalesPiasters > 0, 'تم تسجيل مبيعات بالقروش');
      assert.ok(totalSalesPiasters >= totalReturnsPiasters, 'المبيعات تتفوق على المرتجعات');
      assert.equal(Number.isInteger(totalSalesPiasters), true, 'إجمالي المبيعات عدد صحيح بالقروش');
      assert.equal(Number.isInteger(totalReturnsPiasters), true, 'إجمالي المرتجعات عدد صحيح بالقروش');
    });
  });

});
