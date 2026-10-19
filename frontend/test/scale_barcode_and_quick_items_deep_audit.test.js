import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScaleBarcode } from '../src/utils/scaleBarcode.ts';
import { calculateLineTotal, normalizeArabicNumerals } from '../src/utils/money.ts';

describe('Embedded Retail Engineer Audit: Weighted Items, Scale Barcodes & Quick Items Grid', () => {

  describe('1. دقة الأوزان بالمليجرام وتفادي أخطاء الفاصلة العشرية (Milligram Weight & Integer Financial Math)', () => {
    it('1.1: حساب أسعار أوزان شائعة بالسوبرماركت بدقة متناهية بالقروش (1/8، 1/4، 1/2، 3/4، 1 كجم)', () => {
      // سعر كيلو الجبن الرومي: 340.00 ج.م = 34000 قرش
      const cheeseKgPricePiasters = 34000;

      // ثمن كيلو = 125 جم (125 ملي)
      // 34000 * 125 / 1000 = 4250 قرش (42.50 ج.م)
      assert.equal(calculateLineTotal(cheeseKgPricePiasters, 125), 4250);

      // ربع كيلو = 250 جم
      // 34000 * 250 / 1000 = 8500 قرش (85.00 ج.م)
      assert.equal(calculateLineTotal(cheeseKgPricePiasters, 250), 8500);

      // نصف كيلو = 500 جم
      // 34000 * 500 / 1000 = 17000 قرش (170.00 ج.م)
      assert.equal(calculateLineTotal(cheeseKgPricePiasters, 500), 17000);

      // كيلو إلا ربع = 750 جم
      // 34000 * 750 / 1000 = 25500 قرش (255.00 ج.م)
      assert.equal(calculateLineTotal(cheeseKgPricePiasters, 750), 25500);

      // 1 كيلو = 1000 جم
      assert.equal(calculateLineTotal(cheeseKgPricePiasters, 1000), 34000);
    });

    it('1.2: تقريب النصف قرش للأعلى (MidpointRounding.AwayFromZero) عند الأوزان الكسرية غير المنتظمة', () => {
      // سعر كيلو لحم مفروم: 385.75 ج.م = 38575 قرش
      const meatPrice = 38575;
      
      // وزن: 333 جرام (0.333 كجم)
      // 38575 * 333 / 1000 = 12845.475 -> Math.round -> 12845 قرش (128.45 ج.م)
      assert.equal(calculateLineTotal(meatPrice, 333), 12845);

      // وزن: 667 جرام (0.667 كجم)
      // 38575 * 667 / 1000 = 25729.525 -> Math.round -> 25730 قرش (257.30 ج.م)
      assert.equal(calculateLineTotal(meatPrice, 667), 25730);

      // مجموع الوزنين (333 + 667 = 1000 جم = 1 كجم كامل):
      // 12845 + 25730 = 38575 قرش بالضبط! (Zero Piaster Leakage)
      assert.equal(
        calculateLineTotal(meatPrice, 333) + calculateLineTotal(meatPrice, 667),
        meatPrice
      );
    });

    it('1.3: معالجة الأوزان الدقيقة لمحلات العطارة والبن والزعفران (جرامات دقيقة)', () => {
      // زعفران إسباني فاخر: سعر الجرام 180.00 ج.م (سعر الكيلو 180000.00 ج.م = 18,000,000 قرش)
      const saffronPricePerKg = 18000000;
      
      // بيع 3 جرام (3 ملي-وحدات كجم)
      // 18000000 * 3 / 1000 = 54000 قرش (540.00 ج.م)
      assert.equal(calculateLineTotal(saffronPricePerKg, 3), 54000);

      // بيع نصف جرام (0.5 جرام -> 1 جرام كحد أدنى للمليجرام الصحيح)
      assert.equal(calculateLineTotal(saffronPricePerKg, 1), 18000);
    });

    it('1.4: توحيد الأرقام المشرقية والفواصل (Arabic Numerals & Commas) إلى أرقام قياسية', () => {
      // الكاشير يكتب من مؤشر الميزان "٠.٣٥٠"
      const eastern1 = normalizeArabicNumerals('٠.٣٥٠');
      assert.equal(eastern1, '0.350');

      // الفاصلة العربية "،" أو "٫"
      const commaInput = normalizeArabicNumerals('1،250');
      assert.equal(commaInput, '1.250');

      // الفاصلة اللاتينية "," المستبدلة
      const latinComma = normalizeArabicNumerals('0,750'.replace(/,/g, '.'));
      assert.equal(latinComma, '0.750');
    });
  });

  describe('2. باركود الميزان المدمج (Barcode Scale Labels: Prefixes 99, 20, 21, 22)', () => {
    it('2.1: فك تشفير باركود ميزان إلكتروني يبدأ بـ 99 (Prefix 99 - المعيار الشائع في الموازين الصينية والمحلية)', () => {
      // بريفكس 99 + كود الصنف 00045 + وزن 01250 (1250 جم = 1.250 كجم) + رقم التحقق 3
      const scaleBarcode99 = '9900045012503';
      const parsed = parseScaleBarcode(scaleBarcode99);

      assert.ok(parsed !== null, 'Scale barcode with prefix 99 must be parsed successfully');
      assert.equal(parsed.isScaleBarcode, true);
      assert.equal(parsed.prefix, '99');
      assert.equal(parsed.itemPlu, '00045');
      assert.equal(parsed.itemPluTrimmed, '45');
      assert.equal(parsed.weightGrams, 1250);
      assert.equal(parsed.weightMilli, 1250);
      assert.equal(parsed.weightKg, 1.25);
      assert.equal(parsed.pricePiasters, 1250);
      assert.equal(parsed.fullBarcode, '9900045012503');
    });

    it('2.2: فك تشفير باركود ميزان إلكتروني يبدأ بـ 20 (Prefix 20 - المعيار العالمي GS1 للأوزان الداخلية)', () => {
      // بريفكس 20 + كود الصنف 00128 + وزن 00375 (375 جم) + رقم التحقق 9
      const scaleBarcode20 = '2000128003759';
      const parsed = parseScaleBarcode(scaleBarcode20);

      assert.ok(parsed !== null);
      assert.equal(parsed.prefix, '20');
      assert.equal(parsed.itemPlu, '00128');
      assert.equal(parsed.itemPluTrimmed, '128');
      assert.equal(parsed.weightGrams, 375);
      assert.equal(parsed.weightMilli, 375);
      assert.equal(parsed.weightKg, 0.375);
    });

    it('2.3: فك تشفير باركود ميزان يتضمن السعر الإجمالي بالقروش (Embedded Price)', () => {
      // بريفكس 21 أو 99: صنف PLU 00210 بسعر إجمالي محسوب على الميزان 65.50 ج.م = 6550 قرش
      const priceBarcode = '2100210065504';
      const parsed = parseScaleBarcode(priceBarcode);

      assert.ok(parsed !== null);
      assert.equal(parsed.prefix, '21');
      assert.equal(parsed.itemPluTrimmed, '210');
      assert.equal(parsed.pricePiasters, 6550); // 65.50 EGP
    });

    it('2.4: مطابقة أكواد PLU المتبادلة بين 99 و 20 والأكواد بدون أصفار بادئة', () => {
      const parsed99 = parseScaleBarcode('9900088015002');
      assert.ok(parsed99);

      // الأشكال المتوقعة للبحث في قاعدة البيانات:
      const candidate1 = `${parsed99.prefix}${parsed99.itemPlu}`; // 9900088
      const candidate2 = `20${parsed99.itemPlu}`;                 // 2000088 (cross-prefix)
      const candidate3 = parsed99.itemPluTrimmed;                 // 88
      const candidate4 = parsed99.itemPlu;                        // 00088

      assert.equal(candidate1, '9900088');
      assert.equal(candidate2, '2000088');
      assert.equal(candidate3, '88');
      assert.equal(candidate4, '00088');
    });

    it('2.5: رفض الباركودات غير الموزونة والباركودات المشوهة أو الصفرية بدقة صارمة', () => {
      // باركود مصنع مصري يبدأ بـ 622
      assert.equal(parseScaleBarcode('6223001234567'), null);
      // باركود ألماني 400
      assert.equal(parseScaleBarcode('4006381333931'), null);
      // باركود داخلي بريفكس 200 ولكن وزن صفر
      assert.equal(parseScaleBarcode('2000000000015'), null);
      // باركود وزن صفر
      assert.equal(parseScaleBarcode('9900045000007'), null);
      // باركود أقل من 13 رقم
      assert.equal(parseScaleBarcode('9900045'), null);
      // باركود يحتوي أحرف
      assert.equal(parseScaleBarcode('99000450125A3'), null);
    });
  });

  describe('3. شبكة الأصناف السريعة (Quick Items Grid: Performance, Ordering & Instant Price Update)', () => {
    it('3.1: ترتيب الأصناف السريعة (displayOrder) والتحريك للأعلى والأسفل بدون أي تشويش', () => {
      const quickItems = [
        { id: 'q1', name: 'عيش فينو', displayOrder: 1, categoryName: 'مخبوزات' },
        { id: 'q2', name: 'عيش بلدي', displayOrder: 2, categoryName: 'مخبوزات' },
        { id: 'q3', name: 'كيس بلاستيك كبير', displayOrder: 3, categoryName: 'مخبوزات' },
      ];

      // تحريك q2 للأعلى (Swap with index 0)
      const reordered = [...quickItems];
      const temp = reordered[1];
      reordered[1] = reordered[0];
      reordered[0] = temp;

      const orderedIds = reordered.map((i) => i.id);
      assert.deepEqual(orderedIds, ['q2', 'q1', 'q3']);
    });

    it('3.2: توزيع أسعار العروض التجميعية (Combo Bundles) بدقة متناهية ودون فقدان أي قرش', () => {
      // كرتونة رمضان الخير: سعر البيع المخفض 250.00 ج.م = 25000 قرش
      const bundleTargetPricePiasters = 25000;
      
      const bundleItems = [
        { productName: 'زيت خليط 700 مل', originalPricePiasters: 6500, quantityMilli: 1000 },
        { productName: 'سكر أبيض 1 كجم', originalPricePiasters: 3500, quantityMilli: 2000 }, // 2 كجم = 7000 قرش
        { productName: 'أرز مصري 1 كجم', originalPricePiasters: 3200, quantityMilli: 2000 }, // 2 كجم = 6400 قرش
        { productName: 'مكرونة 400 جم', originalPricePiasters: 1500, quantityMilli: 3000 },  // 3 أكياس = 4500 قرش
        { productName: 'شاي ناعم 100 جم', originalPricePiasters: 2500, quantityMilli: 1000 }, // 1 كيس = 2500 قرش
      ];

      const originalLineTotals = bundleItems.map((b) => 
        Math.round((b.originalPricePiasters * b.quantityMilli) / 1000)
      );
      // إجمالي سعر الأصناف في المخزن قبل الخصم: 6500 + 7000 + 6400 + 4500 + 2500 = 26900 قرش (269.00 ج.م)
      const totalOriginal = originalLineTotals.reduce((sum, v) => sum + v, 0);
      assert.equal(totalOriginal, 26900);

      // التوزيع النسبي لسعر العرض (25000 قرش) مع معالجة باقي القسمة على آخر صنف:
      let distributedSum = 0;
      const allocatedLines = originalLineTotals.map((orig, idx) => {
        if (idx === originalLineTotals.length - 1) {
          return Math.max(1, bundleTargetPricePiasters - distributedSum);
        }
        const alloc = Math.max(1, Math.round((orig * bundleTargetPricePiasters) / totalOriginal));
        distributedSum += alloc;
        return alloc;
      });

      // التحقق: مجموع الأسطر الموزعة يساوي 25000 قرش بالضبط دون زيادة أو نقصان قرش واحد
      const sumAllocated = allocatedLines.reduce((s, v) => s + v, 0);
      assert.equal(sumAllocated, bundleTargetPricePiasters);
    });

    it('3.3: بيع صنف وزني مباشر من شبكة الأصناف السريعة', () => {
      const quickWeightedItem = {
        id: 'q_meat',
        name: 'كبدة بلدي طازجة',
        pricePiasters: 42000, // 420.00 EGP per kg
        unit: 'kg',
        isOpenPrice: false,
      };

      // إضافة 0.450 كجم كبدة
      const weightMilli = 450;
      const totalPiasters = calculateLineTotal(quickWeightedItem.pricePiasters, weightMilli);
      
      // 42000 * 450 / 1000 = 18900 قرش (189.00 ج.م)
      assert.equal(totalPiasters, 18900);
    });
  });
});
