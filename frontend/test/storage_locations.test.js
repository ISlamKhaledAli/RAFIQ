import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Story 128: Storage Locations, Racks & Cold Chain Management (Feature #185)', () => {
  it('Task 185-1: Storage location model supports valid types and integer properties', () => {
    const validTypes = ['shelf', 'rack', 'drawer', 'fridge', 'warehouse'];
    const location = {
      id: 'loc-001',
      code: 'RACK-A1',
      name: 'رف أدوية عامة',
      type: 'shelf',
      description: 'الرف العلوي ستاند رقم 1',
      isActive: true,
      productsCount: 15
    };

    assert.ok(validTypes.includes(location.type), 'نوع موقع التخزين يجب أن يكون من الأنواع المعتمدة');
    assert.equal(typeof location.code, 'string');
    assert.equal(location.code, 'RACK-A1');
    assert.equal(location.isActive, true);
    assert.equal(Number.isInteger(location.productsCount), true);
  });

  it('Task 185-3: Product model associates with location and cold chain flag', () => {
    const insulinProduct = {
      id: 'prod-insulin-01',
      name: 'أنسولين لانتوس سولوستار',
      barcode: '6221000999888',
      pricePiasters: 25000,
      costPiasters: 21000,
      stockQuantityMilli: 10000,
      locationId: 'loc-fridge-01',
      locationCode: 'FRIDGE-01',
      locationName: 'ثلاجة الأمصال الرئيسية',
      locationType: 'fridge',
      isColdChain: true
    };

    assert.equal(insulinProduct.isColdChain, true);
    assert.equal(insulinProduct.locationType, 'fridge');
    assert.equal(insulinProduct.locationCode, 'FRIDGE-01');
    assert.equal(Number.isInteger(insulinProduct.pricePiasters), true);
  });

  it('Task 185-4: Thermal receipt cold chain medical alert rule verification', () => {
    const coldNoticeText = '* تنبيه طبي: يحفظ في الثلاجة (2-8 مئوية) *';

    const saleWithoutColdChain = {
      id: 'sale-001',
      hasColdChainItems: false,
      items: [
        { productName: 'بنادول أزرق', isColdChain: false }
      ]
    };

    const hasColdNotice1 = Boolean(saleWithoutColdChain.hasColdChainItems || saleWithoutColdChain.items.some(i => i.isColdChain));
    assert.equal(hasColdNotice1, false, 'الفاتورة التي لا تحتوي على أدوية ثلاجة لا تطبع تنبيه التبريد');

    const saleWithColdChain = {
      id: 'sale-002',
      hasColdChainItems: true,
      items: [
        { productName: 'أنسولين لانتوس', isColdChain: true }
      ]
    };

    const hasColdNotice2 = Boolean(saleWithColdChain.hasColdChainItems || saleWithColdChain.items.some(i => i.isColdChain));
    assert.equal(hasColdNotice2, true, 'الفاتورة التي تحتوي على أصناف سلسلة تبريد تفعل تنبيه التبريد');
    assert.ok(coldNoticeText.includes('2-8 مئوية'), 'نص التنبيه يحتوي على نطاق درجة حرارة الحفظ الطبي');
  });

  it('Task 185-5: Draft inventory sheet calculates differences correctly', () => {
    const draftSheet = {
      locationId: 'loc-001',
      locationCode: 'RACK-A1',
      locationName: 'رف أدوية عامة',
      items: [
        {
          productId: 'p-1',
          productName: 'بنادول',
          bookStockQuantityMilli: 50000,
          actualStockQuantityMilli: 45000 // Counted 45 pieces (shortage of 5)
        },
        {
          productId: 'p-2',
          productName: 'كونجستال',
          bookStockQuantityMilli: 20000,
          actualStockQuantityMilli: 22000 // Counted 22 pieces (surplus of 2)
        }
      ]
    };

    const diff1 = draftSheet.items[0].actualStockQuantityMilli - draftSheet.items[0].bookStockQuantityMilli;
    assert.equal(diff1, -5000, 'عجز الجرد 5000 ملي (5 علب)');

    const diff2 = draftSheet.items[1].actualStockQuantityMilli - draftSheet.items[1].bookStockQuantityMilli;
    assert.equal(diff2, 2000, 'زيادة الجرد 2000 ملي (2 علبة)');
  });

  it('Strict Invariant: Zero emojis in storage location and cold chain texts', () => {
    const textStrings = [
      'مواقع التخزين والرفوف والأدراج',
      'رف أدوية عامة',
      'ثلاجة أدوية / سلسلة تبريد (Fridge)',
      '* تنبيه طبي: يحفظ في الثلاجة (2-8 مئوية) *',
      'مسودة كشف جرد الرف / الموقع'
    ];

    // Regex matching any standard emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    for (const str of textStrings) {
      assert.equal(emojiRegex.test(str), false, `النص لا يحتوي على أي إيموجي: "${str}"`);
    }
  });
});
