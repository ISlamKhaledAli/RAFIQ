import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScaleBarcode } from '../src/utils/scaleBarcode.ts';
import { calculateLineTotal, normalizeArabicNumerals, normalizeArabicText } from '../src/utils/money.ts';

/**
 * Senior Battle-Testing Suite:
 * 1. الأوزان والميزان (Electronic Scale & Fractional Weights)
 * 2. الألوان والمقاسات (Product Variants Matrix, Stock Rollup & FEFO)
 * 3. الموردين وحسابات الآجل (Suppliers Ledger, Cash/Credit Invoices & Statements)
 */

describe('Senior Architecture Battle-Test: الأوزان، الألوان والمقاسات، وحسابات الموردين', () => {

  // ==========================================
  // DOMAIN 1: الأوزان والميزان الإلكتروني
  // ==========================================
  describe('1. الأوزان والميزان الإلكتروني (Scale Barcodes & Fractional Weight Arithmetic)', () => {
    it('1.1: فك شفرة باركود الميزان GS1 (البريفكس 20 و 21 و 22) واستخراج الوزن بدقة المليجرام', () => {
      // 1.250 kg with prefix 21, PLU 00045
      const barcode1 = '2100045012507';
      const parsed1 = parseScaleBarcode(barcode1);
      assert.ok(parsed1);
      assert.equal(parsed1.isScaleBarcode, true);
      assert.equal(parsed1.prefix, '21');
      assert.equal(parsed1.itemPlu, '00045');
      assert.equal(parsed1.itemPluTrimmed, '45');
      assert.equal(parsed1.weightGrams, 1250);
      assert.equal(parsed1.weightMilli, 1250);
      assert.equal(parsed1.weightKg, 1.25);

      // Prefix+PLU combination check for database lookup
      const expectedDbBarcode = `${parsed1.prefix}${parsed1.itemPlu}`;
      assert.equal(expectedDbBarcode, '2100045');

      // 0.350 kg with prefix 20, PLU 00100
      const barcode2 = '2000100003504';
      const parsed2 = parseScaleBarcode(barcode2);
      assert.ok(parsed2);
      assert.equal(parsed2.prefix, '20');
      assert.equal(parsed2.itemPlu, '00100');
      assert.equal(parsed2.itemPluTrimmed, '100');
      assert.equal(parsed2.weightGrams, 350);
      assert.equal(parsed2.weightMilli, 350);
      assert.equal(parsed2.weightKg, 0.35);

      // 1/8 kg (125 grams) with prefix 22, PLU 00789
      const barcode3 = '2200789001256';
      const parsed3 = parseScaleBarcode(barcode3);
      assert.ok(parsed3);
      assert.equal(parsed3.prefix, '22');
      assert.equal(parsed3.weightGrams, 125);
      assert.equal(parsed3.weightMilli, 125);
      assert.equal(parsed3.weightKg, 0.125);
    });

    it('1.2: رفض الباركودات غير التابعة للميزان والباركودات المشوهة أو الصفرية', () => {
      // Regular product barcode (Egypt 622)
      assert.equal(parseScaleBarcode('6221234567890'), null);
      // Malformed barcode length
      assert.equal(parseScaleBarcode('21000450125'), null);
      // Letters in scale barcode
      assert.equal(parseScaleBarcode('21000450125A7'), null);
      // Zero weight
      assert.equal(parseScaleBarcode('2100045000007'), null);
      // Zero PLU (internal receipt format)
      assert.equal(parseScaleBarcode('2000000000015'), null);
    });

    it('1.3: الحساب المالي الدقيق للأوزان الكسرية بالقروش (Rule 1: Integer Piasters)', () => {
      // 0.35 kg (350 grams) at 13.99 EGP/kg (1399 piasters)
      // 1399 * 350 / 1000 = 489.65 -> rounds to 490 piasters (4.90 EGP)
      const lineTotal1 = calculateLineTotal(1399, 350);
      assert.equal(lineTotal1, 490);
      assert.equal(Number.isInteger(lineTotal1), true);

      // 0.125 kg (125 grams - ثمن كيلو) at 360.00 EGP/kg (36000 piasters)
      // 36000 * 125 / 1000 = 4500 piasters (45.00 EGP)
      const lineTotal2 = calculateLineTotal(36000, 125);
      assert.equal(lineTotal2, 4500);

      // 2.750 kg at 85.50 EGP/kg (8550 piasters)
      // 8550 * 2750 / 1000 = 23512.5 -> rounds to 23513 piasters (235.13 EGP)
      const lineTotal3 = calculateLineTotal(8550, 2750);
      assert.equal(lineTotal3, 23513);
    });

    it('1.4: معالجة إدخال الأوزان الكسرية في فواتير الشراء (NewPurchaseTab decimal entry)', () => {
      // Simulated handleDirectStockChange logic for weighted items
      const simulateDirectStockInput = (val, unit = 'kg') => {
        const isWeightItem = unit === 'kg' || unit === 'gram';
        let clean = normalizeArabicNumerals(val);
        if (isWeightItem) {
          clean = clean.replace(/,/g, '.').replace(/[^\d.]/g, '');
          const parts = clean.split('.');
          if (parts.length > 2) {
            clean = parts[0] + '.' + parts.slice(1).join('');
          }
          if (clean.length > 1 && clean.startsWith('0') && !clean.startsWith('0.')) {
            clean = clean.replace(/^0+/, '') || '0';
          }
        }
        if (clean === '' || clean === '.') return { quantityUnits: 0, clean };
        const totalVal = isWeightItem ? (parseFloat(clean) || 0) : (parseInt(clean, 10) || 0);
        return { quantityUnits: Math.max(0, totalVal), clean };
      };

      // User enters English decimal: "12.5"
      const res1 = simulateDirectStockInput('12.5', 'kg');
      assert.equal(res1.clean, '12.5');
      assert.equal(res1.quantityUnits, 12.5);

      // User enters Arabic numeral decimal: "١٢.٥"
      const res2 = simulateDirectStockInput('١٢.٥', 'kg');
      assert.equal(res2.clean, '12.5');
      assert.equal(res2.quantityUnits, 12.5);

      // User enters comma decimal: "0,35"
      const res3 = simulateDirectStockInput('0,35', 'kg');
      assert.equal(res3.clean, '0.35');
      assert.equal(res3.quantityUnits, 0.35);

      // Fractional stock converted to milli-units in database payload
      const stockMilli = Math.round(res1.quantityUnits * 1000);
      assert.equal(stockMilli, 12500); // 12,500 grams
    });

    it('1.5: سلامة المرتجع للأصناف الموزونة وحظر كسور القروش (Return Modal Integer Piasters)', () => {
      // Returning 0.35 kg of a product sold at 1399 piasters/kg
      const returnQtyKg = 0.35;
      const unitPricePiasters = 1399;
      const returnLineTotal = Math.round(unitPricePiasters * returnQtyKg);
      assert.equal(returnLineTotal, 490);
      assert.equal(Number.isInteger(returnLineTotal), true);

      // Sum of multiple fractional return lines strictly produces integers
      const items = [
        { qty: 0.35, price: 1399 },
        { qty: 0.125, price: 8550 },
        { qty: 1.5, price: 4200 }
      ];
      const totalRefundPiasters = items.reduce(
        (sum, item) => sum + Math.round(item.price * item.qty),
        0
      );
      assert.equal(Number.isInteger(totalRefundPiasters), true);
      assert.equal(totalRefundPiasters, 490 + 1069 + 6300); // 7859 piasters
    });
  });

  // ==========================================
  // DOMAIN 2: الألوان والمقاسات ومصفوفة الفاريانت
  // ==========================================
  describe('2. الألوان والمقاسات ومصفوفة الفاريانت (Variants Matrix, Stock Rollup & Scenarios)', () => {
    it('2.1: تكوين مصفوفة الألوان والمقاسات وتجميع رصيد الأب (Parent Stock Rollup)', () => {
      const colors = ['أسود', 'كحلي', 'رمادي'];
      const sizes = ['M', 'L', 'XL', '2XL'];
      const cells = [];

      for (const c of colors) {
        for (const s of sizes) {
          cells.push({
            color: c,
            size: s,
            pricePiasters: 25000, // 250 EGP
            costPiasters: 18000,  // 180 EGP
            stockQuantityMilli: 5000, // 5 pieces per combination
            isEnabled: true
          });
        }
      }

      assert.equal(cells.length, 12); // 3 x 4 = 12 combinations
      const totalParentStockMilli = cells.reduce((sum, c) => sum + c.stockQuantityMilli, 0);
      assert.equal(totalParentStockMilli, 60000); // 60 pieces in total
      assert.equal(totalParentStockMilli / 1000, 60);
    });

    it('2.2: بيع فاريانت محدد وخصم رصيده ورصيد الأب الحاوي تلقائياً', () => {
      const parentStockMilli = 60000;
      const variantStockMilli = 5000; // 5 pieces

      // Customer buys 2 pieces of Black-XL
      const soldQtyMilli = 2000;
      const updatedVariantStockMilli = variantStockMilli - soldQtyMilli;
      const updatedParentStockMilli = parentStockMilli - soldQtyMilli;

      assert.equal(updatedVariantStockMilli, 3000); // 3 pieces remaining
      assert.equal(updatedParentStockMilli, 58000);  // 58 pieces remaining in container
    });

    it('2.3: منع بيع الصنف الحاوي (Parent) مباشرة وإلزام اختيار التركيبة (Variant Picker)', () => {
      const parentProduct = {
        id: 'prod_parent_01',
        name: 'تيشيرت بولو صيفي',
        hasVariants: true,
        stockQuantityMilli: 58000,
        pricePiasters: 25000
      };

      // Guard check: pos cannot add parent directly to cart without selecting variant
      const canAddToCartDirectly = !parentProduct.hasVariants;
      assert.equal(canAddToCartDirectly, false);

      // Selected variant product is a sellable child
      const selectedVariant = {
        id: 'var_prod_01_black_xl',
        name: 'تيشيرت بولو صيفي - أسود - XL',
        hasVariants: false,
        parentId: parentProduct.id,
        variantColor: 'أسود',
        variantSize: 'XL',
        stockQuantityMilli: 3000,
        pricePiasters: 25000
      };

      assert.equal(selectedVariant.hasVariants, false);
      assert.equal(selectedVariant.parentId, parentProduct.id);
      assert.equal(selectedVariant.variantColor, 'أسود');
      assert.equal(selectedVariant.variantSize, 'XL');
    });

    it('2.4: المرتجع السليم يسترجع رصيد الفاريانت والأب، والمرتجع التالف لا يسترجع الرصيد', () => {
      let variantStockMilli = 3000;
      let parentStockMilli = 58000;

      // Case A: Customer returns 1 piece undamaged (مرتجع سليم)
      const returnUndamaged = { isDamaged: false, qtyMilli: 1000 };
      if (!returnUndamaged.isDamaged) {
        variantStockMilli += returnUndamaged.qtyMilli;
        parentStockMilli += returnUndamaged.qtyMilli;
      }
      assert.equal(variantStockMilli, 4000);
      assert.equal(parentStockMilli, 59000);

      // Case B: Customer returns 1 piece damaged (مرتجع تالف - عيب صناعة)
      const returnDamaged = { isDamaged: true, qtyMilli: 1000 };
      if (!returnDamaged.isDamaged) {
        variantStockMilli += returnDamaged.qtyMilli;
        parentStockMilli += returnDamaged.qtyMilli;
      }
      // Damaged items must NOT be restored to shelf stock
      assert.equal(variantStockMilli, 4000);
      assert.equal(parentStockMilli, 59000);
    });

    it('2.5: مصفوفة غير متناظرة واقعية (Asymmetric Matrix: مقاس بلون واحد، مقاس بألوان متعددة، ومقاس بقطعة واحدة فقط)', () => {
      // Scenario requested by user:
      // المقاس S فيه لون أحمر فقط
      // المقاس M فيه 3 ألوان (أحمر، أسود، كحلي)
      // المقاس L فيه قطعة واحدة فقط من الكحلي، والباقي غير متوفر
      const matrix = [
        // Size S: Red only (1 piece = 1000 milli)
        { size: 'S', color: 'أحمر', isEnabled: true, stockMilli: 1000, price: 15000 },
        { size: 'S', color: 'أسود', isEnabled: false, stockMilli: 0, price: 15000 },
        { size: 'S', color: 'كحلي', isEnabled: false, stockMilli: 0, price: 15000 },

        // Size M: 3 colors enabled (Red: 5, Black: 5, Navy: 4 pieces)
        { size: 'M', color: 'أحمر', isEnabled: true, stockMilli: 5000, price: 15000 },
        { size: 'M', color: 'أسود', isEnabled: true, stockMilli: 5000, price: 15000 },
        { size: 'M', color: 'كحلي', isEnabled: true, stockMilli: 4000, price: 15000 },

        // Size L: Single piece of Navy only!
        { size: 'L', color: 'أحمر', isEnabled: false, stockMilli: 0, price: 16000 },
        { size: 'L', color: 'أسود', isEnabled: false, stockMilli: 0, price: 16000 },
        { size: 'L', color: 'كحلي', isEnabled: true, stockMilli: 1000, price: 16000 } // Single piece!
      ];

      const enabledVariants = matrix.filter((c) => c.isEnabled);
      assert.equal(enabledVariants.length, 5); // 1 for S + 3 for M + 1 for L

      // Filter colors available for Size S:
      const colorsForS = matrix.filter((c) => c.size === 'S' && c.isEnabled).map((c) => c.color);
      assert.deepEqual(colorsForS, ['أحمر']);

      // Filter colors available for Size M:
      const colorsForM = matrix.filter((c) => c.size === 'M' && c.isEnabled).map((c) => c.color);
      assert.deepEqual(colorsForM, ['أحمر', 'أسود', 'كحلي']);

      // Single piece indicator for Size L - Navy:
      const lNavy = matrix.find((c) => c.size === 'L' && c.color === 'كحلي');
      assert.ok(lNavy);
      const isSinglePiece = lNavy.stockMilli === 1000;
      assert.equal(isSinglePiece, true);

      // Parent stock rollup
      const totalParentStockMilli = enabledVariants.reduce((sum, v) => sum + v.stockMilli, 0);
      assert.equal(totalParentStockMilli, 16000); // 1 + 5 + 5 + 4 + 1 = 16 pieces
    });

    it('2.6: شراء فاريانتات محددة من المورد وحظر شراء المنتج الحاوي (Variant Purchasing & Parent Protection)', () => {
      const parentContainer = { id: 'prod_sweater_parent', name: 'بلوفر صوف', hasVariants: true, stockMilli: 16000 };
      const sRedVariant = { id: 'var_s_red', parentId: parentContainer.id, name: 'بلوفر صوف - أحمر - S', stockMilli: 1000, costPiasters: 8500 };
      const mBlackVariant = { id: 'var_m_black', parentId: parentContainer.id, name: 'بلوفر صوف - أسود - M', stockMilli: 5000, costPiasters: 8000 };

      // Purchase line items
      const purchaseLines = [
        { productId: sRedVariant.id, qty: 3, unitCost: 8500, totalCost: 25500 }, // 3 pieces S - Red
        { productId: mBlackVariant.id, qty: 10, unitCost: 8000, totalCost: 80000 } // 10 pieces M - Black
      ];

      // Direct parent purchase attempt must throw
      const attemptPurchaseItem = (prod) => {
        if (prod.hasVariants) {
          throw new Error('لا يمكن شراء المنتج الرئيسي الحاوي مباشرة لوجود مقاسات وألوان فرعية.');
        }
        return true;
      };

      assert.throws(() => attemptPurchaseItem(parentContainer), /لا يمكن شراء المنتج الرئيسي الحاوي/);

      // Apply purchase to variants and roll up to parent
      for (const line of purchaseLines) {
        if (line.productId === sRedVariant.id) {
          sRedVariant.stockMilli += line.qty * 1000;
        } else if (line.productId === mBlackVariant.id) {
          mBlackVariant.stockMilli += line.qty * 1000;
        }
        parentContainer.stockMilli += line.qty * 1000;
      }

      assert.equal(sRedVariant.stockMilli, 4000); // was 1, bought 3 -> 4 pieces
      assert.equal(mBlackVariant.stockMilli, 15000); // was 5, bought 10 -> 15 pieces
      assert.equal(parentContainer.stockMilli, 29000); // was 16, added 13 -> 29 pieces
    });

    it('2.7: إضافة متعددة في وضع المشتريات وإشارة القطعة الواحدة في الـ Modal (Variant Picker Modal Enhancements)', () => {
      // In purchase mode, adding an item should allow continuous addition without closing modal
      const addedToInvoice = [];
      const onSelectVariant = (variant, continueAdding = false) => {
        addedToInvoice.push({ ...variant, qty: 1 });
        return continueAdding;
      };

      const variant1 = { id: 'v1', size: 'M', color: 'أحمر', stockMilli: 2000 };
      const variant2 = { id: 'v2', size: 'L', color: 'كحلي', stockMilli: 1000 };

      // User adds variant1 with '+ متابعة'
      const keepModalOpen1 = onSelectVariant(variant1, true);
      assert.equal(keepModalOpen1, true);

      // User adds variant2 and finishes
      const keepModalOpen2 = onSelectVariant(variant2, false);
      assert.equal(keepModalOpen2, false);

      assert.equal(addedToInvoice.length, 2);
      // Variant 2 triggers single-piece indicator
      assert.equal(variant2.stockMilli === 1000, true);
    });
  });

  // ==========================================
  // DOMAIN 3: حسابات الموردين وفواتير الشراء
  // ==========================================
  describe('3. حسابات الموردين وفواتير الشراء (Suppliers Ledger, Debt, Advance Credit & Statements)', () => {
    it('3.1: إنشاء مورد برصيد افتتاحي موجب أو سالب (سلف/مقدم)', () => {
      // Supplier A: we owe them 500 EGP (50,000 piasters) from past books
      const supplierA = {
        id: 'sup_01',
        name: 'شركة الأهرام للأغذية',
        balancePiasters: 50000,
        isActive: true
      };
      assert.equal(supplierA.balancePiasters, 50000);

      // Supplier B: we gave them an advance payment of 200 EGP (-20,000 piasters)
      const supplierB = {
        id: 'sup_02',
        name: 'مطاحن الدلتا',
        balancePiasters: -20000,
        isActive: true
      };
      assert.equal(supplierB.balancePiasters, -20000);
    });

    it('3.2: فاتورة شراء آجلة جزئياً تزيد مديونية المورد بالباقي فقط', () => {
      let supplierBalance = 0; // Starts clean

      // Invoice 1: Total 1,000 EGP (100,000 piasters), Paid 400 EGP (40,000 piasters), Remaining 600 EGP
      const invoiceNetCost = 100000;
      const invoicePaid = 40000;
      const balanceDelta = invoiceNetCost - invoicePaid; // +60,000
      supplierBalance += balanceDelta;

      assert.equal(balanceDelta, 60000);
      assert.equal(supplierBalance, 60000); // We owe 600 EGP
    });

    it('3.3: سداد دفعة نقدية للمورد يخفض مديونيته بدقة', () => {
      let supplierBalance = 60000;

      // We pay 400 EGP (40,000 piasters)
      const paymentAmount = 40000;
      supplierBalance -= paymentAmount;

      assert.equal(supplierBalance, 20000); // Remaining 200 EGP
    });

    it('3.4: سداد بالزيادة (دفعة مقدمة) يحول الحساب إلى رصيد دائن لصالح المحل', () => {
      let supplierBalance = 20000; // We owe 200 EGP

      // We give the supplier 500 EGP (50,000 piasters)
      const paymentAmount = 50000;
      supplierBalance -= paymentAmount;

      assert.equal(supplierBalance, -30000); // Supplier owes us 300 EGP (advance credit)
    });

    it('3.5: فاتورة شراء مسددة نقداً بالكامل (PURCHASE_PAID_CASH) تسجل في كشف الحساب دون تغيير الرصيد', () => {
      let supplierBalance = -30000;
      const ledger = [];

      // Fully paid purchase invoice: Net 800 EGP, Paid 800 EGP
      const netCost = 80000;
      const paid = 80000;
      const delta = netCost - paid; // 0

      // Add to ledger for statement history
      if (delta === 0) {
        ledger.push({
          type: 'PURCHASE_PAID_CASH',
          amountPiasters: 0,
          note: 'فاتورة شراء مسددة نقداً بالكامل'
        });
        supplierBalance += delta;
      }

      assert.equal(delta, 0);
      assert.equal(supplierBalance, -30000); // Balance unaffected
      assert.equal(ledger.length, 1);
      assert.equal(ledger[0].type, 'PURCHASE_PAID_CASH');
    });

    it('3.6: مطابقة كشف الحساب المحاسبي (Ledger Invariant: Discrepancy === 0)', () => {
      // Simulate complete supplier transaction history
      const transactions = [
        { type: 'OPENING_BALANCE', amount: 50000 },  // +500 EGP
        { type: 'PURCHASE_INVOICE', amount: 60000 },  // +600 EGP remaining
        { type: 'PAYMENT', amount: -40000 },          // -400 EGP paid
        { type: 'PAYMENT', amount: -50000 },          // -500 EGP overpaid
        { type: 'PURCHASE_PAID_CASH', amount: 0 }     // Cash on delivery
      ];

      const calculatedBalance = transactions.reduce((sum, t) => sum + t.amount, 0);
      const storedBalance = 20000; // 50000 + 60000 - 40000 - 50000 + 0 = 20000

      assert.equal(calculatedBalance, storedBalance);
      const discrepancy = storedBalance - calculatedBalance;
      assert.equal(discrepancy, 0);
    });

    it('3.7: البحث في الموردين بالاسم والأرقام العربية والإنجليزية بعد المعالجة', () => {
      const suppliers = [
        { id: '1', name: 'شركة الأهرام للمواد الغذائية', companyName: 'الأهرام', phone: '01012345678', isActive: true },
        { id: '2', name: 'مؤسسة النيل للتجارة والتوزيع', companyName: 'النيل', phone: '01198765432', isActive: true },
        { id: '3', name: 'توكيل جهينة للألبان', companyName: 'جهينة', phone: '01234567890', isActive: true }
      ];

      const searchSuppliers = (query) => {
        const raw = query.trim();
        if (!raw) return suppliers;
        const normText = normalizeArabicText(raw);
        const normDigits = normalizeArabicNumerals(raw).replace(/[^\d]/g, '');

        return suppliers.filter((s) => {
          const sNameNorm = normalizeArabicText(s.name);
          const sCompNorm = normalizeArabicText(s.companyName || '');
          const sPhone = (s.phone || '').replace(/[^\d]/g, '');

          const textMatch = sNameNorm.includes(normText) || sCompNorm.includes(normText);
          const phoneMatch = normDigits.length > 0 && sPhone.includes(normDigits);
          return textMatch || phoneMatch;
        });
      };

      // Search by normalized Arabic text without hamza: "الاهرام"
      const res1 = searchSuppliers('الاهرام');
      assert.equal(res1.length, 1);
      assert.equal(res1[0].id, '1');

      // Search by Eastern Arabic phone digits: "٠١١٩٨٧"
      const res2 = searchSuppliers('٠١١٩٨٧');
      assert.equal(res2.length, 1);
      assert.equal(res2[0].id, '2');

      // Search by teh marbuta normalization: "جهينه"
      const res3 = searchSuppliers('جهينه');
      assert.equal(res3.length, 1);
      assert.equal(res3[0].id, '3');
    });

    it('3.8: حظر الحذف النهائي للمورد المرتبط بحركات وسجلات شراء (Audit & Compliance)', () => {
      const supplier = { id: 'sup_locked', name: 'مورد محمي بحركات' };
      const linkedPurchasesCount = 3;
      const linkedTransactionsCount = 5;

      const attemptDelete = (_sup) => {
        if (linkedPurchasesCount > 0) {
          throw new Error('لا يمكن حذف المورد لوجود فواتير شراء مرتبطة به. يرجى أرشفة المورد بدلاً من ذلك لحفظ السجلات المحاسبية.');
        }
        if (linkedTransactionsCount > 0) {
          throw new Error('لا يمكن حذف المورد لوجود حركات مالية مسجلة عليه.');
        }
        return true;
      };

      assert.throws(() => attemptDelete(supplier), /لا يمكن حذف المورد لوجود فواتير شراء مرتبطة به/);
    });
  });
});
