import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSmartDescriptionOptions,
  generateSmartDescription,
  resolveEffectiveActivityType,
} from '../src/utils/smartDescriptionGenerator.ts';

// Unicode Regex for emojis
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

test('Smart Description Generator: Store Activity Resolution', () => {
  // 1. Explicit storeType
  assert.equal(resolveEffectiveActivityType('pharmacy'), 'pharmacy');
  assert.equal(resolveEffectiveActivityType('restaurant'), 'cafe_restaurant');
  assert.equal(resolveEffectiveActivityType('cafe_restaurant'), 'cafe_restaurant');
  assert.equal(resolveEffectiveActivityType('stationery_gifts'), 'stationery_gifts');
  assert.equal(resolveEffectiveActivityType('stationery'), 'stationery_gifts');
  assert.equal(resolveEffectiveActivityType('clothing_apparel'), 'clothing_apparel');
  assert.equal(resolveEffectiveActivityType('clothing'), 'clothing_apparel');
  assert.equal(resolveEffectiveActivityType('phones_electronics'), 'phones_electronics');
  assert.equal(resolveEffectiveActivityType('electronics'), 'phones_electronics');
  assert.equal(resolveEffectiveActivityType('spices_roastery'), 'spices_roastery');
  assert.equal(resolveEffectiveActivityType('produce_butchery'), 'produce_butchery');
  assert.equal(resolveEffectiveActivityType('dairy_bakery'), 'dairy_bakery');
  assert.equal(resolveEffectiveActivityType('toys_kids'), 'toys_kids');
  assert.equal(resolveEffectiveActivityType('supermarket'), 'supermarket');

  // 2. Keyword heuristic when no storeType provided
  assert.equal(resolveEffectiveActivityType('', 'بانادول أقراص 500 مجم', 'أدوية ومسكنات'), 'pharmacy');
  assert.equal(resolveEffectiveActivityType('', 'ساندوتش برجر دبل لحم', 'ساندوتشات'), 'cafe_restaurant');
  assert.equal(resolveEffectiveActivityType('', 'كشكول سلك 80 ورقة A4', 'أدوات مدرسية'), 'stationery_gifts');
  assert.equal(resolveEffectiveActivityType('', 'تيشرت بولو قطن رجالي', 'ملابس كاجوال'), 'clothing_apparel');
  assert.equal(resolveEffectiveActivityType('', 'شاحن سريع 65 واط Type-C', 'إلكترونيات'), 'phones_electronics');
  assert.equal(resolveEffectiveActivityType('', 'بن محوج وسط حبهان', 'محامص وبن'), 'spices_roastery');
  assert.equal(resolveEffectiveActivityType('', 'كفتة بلدي مفروم طازج', 'لحوم وجزارة'), 'produce_butchery');
  assert.equal(resolveEffectiveActivityType('', 'جبنة قريش فلاحي طبيعي', 'ألبان'), 'dairy_bakery');
  assert.equal(resolveEffectiveActivityType('', 'مكعبات ليجو تعليمية للأطفال', 'ألعاب'), 'toys_kids');
  assert.equal(resolveEffectiveActivityType('', 'مسحوق غسيل أوتوماتيك 5 كجم', 'منظفات'), 'supermarket');
});

test('Smart Description Generator: Pharmacy Activity Descriptions', () => {
  const prod = {
    name: 'بانادول إكسترا 500 مجم 24 قرص',
    category_name: 'مسكنات وخافض حرارة',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'pharmacy');

  assert.ok(opts.catchy.includes('علاج طبي موثوق'));
  assert.ok(opts.catchy.includes('500 مجم'));
  assert.ok(opts.catchy.includes('24 قرص'));
  assert.ok(opts.short.includes('مستحضر دوائي معتمد'));
  assert.ok(opts.detailed.includes('• تركيبة دوائية معتمدة'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
  assert.ok(!EMOJI_REGEX.test(opts.short));
  assert.ok(!EMOJI_REGEX.test(opts.detailed));
});

test('Smart Description Generator: Restaurant & Cafe Activity Descriptions', () => {
  const prod = {
    name: 'ساندوتش فاهيتا فراخ سوبريم',
    category_name: 'ساندوتشات ووجبات سريعة',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'cafe_restaurant');

  assert.ok(opts.catchy.includes('تجربة المذاق الحقيقي'));
  assert.ok(opts.short.includes('وجبة شهية وطازجة'));
  assert.ok(opts.detailed.includes('• لحوم ومكونات طازجة'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
  assert.ok(!EMOJI_REGEX.test(opts.short));
  assert.ok(!EMOJI_REGEX.test(opts.detailed));

  // Coffee & Hot Drinks
  const coffee = {
    name: 'كابتشينو دوبل فوم',
    category_name: 'مشروبات ساخنة',
  };
  const coffeeOpts = generateSmartDescriptionOptions(coffee, coffee.category_name, 'cafe_restaurant');
  assert.ok(coffeeOpts.catchy.includes('اضبط مزاجك'));
  assert.ok(coffeeOpts.short.includes('مشروب ساخن فاخر'));
  assert.ok(!EMOJI_REGEX.test(coffeeOpts.catchy));
});

test('Smart Description Generator: Stationery & Bookstore Activity Descriptions', () => {
  const prod = {
    name: 'كشكول سلك A4 80 ورقة',
    category_name: 'كشاكيل ودفاتر',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'stationery_gifts');

  assert.ok(opts.catchy.includes('دوّن أفكارك وذاكر'));
  assert.ok(opts.catchy.includes('A4'));
  assert.ok(opts.short.includes('دفاتر وورقيات عالية الجودة'));
  assert.ok(opts.detailed.includes('• ورق عالي النقاء'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
  assert.ok(!EMOJI_REGEX.test(opts.short));
  assert.ok(!EMOJI_REGEX.test(opts.detailed));
});

test('Smart Description Generator: Clothing & Fashion Activity Descriptions', () => {
  const prod = {
    name: 'تيشرت قطن أوفر سايز مقاس XL',
    category_name: 'ملابس كاجوال',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'clothing_apparel');

  assert.ok(opts.catchy.includes('أناقة عصرية'));
  assert.ok(opts.catchy.includes('XL'));
  assert.ok(opts.short.includes('ملابس كاجوال أنيقة ومريحة'));
  assert.ok(opts.detailed.includes('• قماش قطني ممتاز'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
});

test('Smart Description Generator: Electronics & Phones Activity Descriptions', () => {
  const prod = {
    name: 'شاحن سريع 65 واط Type-C',
    category_name: 'شواحن ووصلات',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'phones_electronics');

  assert.ok(opts.catchy.includes('شحن فائق السرعة'));
  assert.ok(opts.catchy.includes('65 واط'));
  assert.ok(opts.short.includes('شاحن وكابل سريع'));
  assert.ok(opts.detailed.includes('• يدعم بروتوكولات الشحن السريع'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
});

test('Smart Description Generator: Roastery & Spices Activity Descriptions', () => {
  const prod = {
    name: 'بن برازيلي محوج حبهان وسط 250 جم',
    category_name: 'بن وقهوة',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'spices_roastery');

  assert.ok(opts.catchy.includes('ريحة تحميص طازجة'));
  assert.ok(opts.catchy.includes('250 جم'));
  assert.ok(opts.short.includes('بن فاخر ومحمص طازجاً'));
  assert.ok(opts.detailed.includes('• بن نقي 100%'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
});

test('Smart Description Generator: Produce & Butchery Activity Descriptions', () => {
  const prod = {
    name: 'لحم بتلو بلدي مفروم 1 كجم',
    category_name: 'لحوم وجزارة',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'produce_butchery');

  assert.ok(opts.catchy.includes('ذبح طازج وجودة بلدي'));
  assert.ok(opts.short.includes('لحوم ودواجن طازجة'));
  assert.ok(opts.detailed.includes('• ذبح يومي طازج'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
});

test('Smart Description Generator: Dairy & Bakery Activity Descriptions', () => {
  const prod = {
    name: 'جبنة قريش طبيعي فلاحي 1 كيلو',
    category_name: 'منتجات ألبان',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'dairy_bakery');

  assert.ok(opts.catchy.includes('طعم فلاحي أصيل'));
  assert.ok(opts.short.includes('منتجات ألبان وجبن طازجة'));
  assert.ok(opts.detailed.includes('• حليب طبيعي طازج'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
});

test('Smart Description Generator: Supermarket Default & Sub-categories', () => {
  const prod = {
    name: 'آيس كريم شوكولاتة ميجا كونو',
    category_name: 'مثلجات',
  };

  const opts = generateSmartDescriptionOptions(prod, prod.category_name, 'supermarket');

  assert.ok(opts.catchy.includes('بانتعاش استثنائي'));
  assert.ok(opts.short.includes('آيس كريم فاخر'));
  assert.ok(opts.detailed.includes('• نكهة غنية وقوام كريمي'));
  assert.ok(!EMOJI_REGEX.test(opts.catchy));
});

test('Smart Description Generator: generateSmartDescription Helper with tone', () => {
  const prod = {
    name: 'قلم جاف أزرق 0.7 مم',
    category_name: 'أقلام',
  };

  const catchy = generateSmartDescription(prod, prod.category_name, 'catchy', 'stationery_gifts');
  const shortDesc = generateSmartDescription(prod, prod.category_name, 'short', 'stationery_gifts');
  const detailed = generateSmartDescription(prod, prod.category_name, 'detailed', 'stationery_gifts');

  assert.ok(catchy.length > 50);
  assert.ok(shortDesc.length > 20 && shortDesc.length < catchy.length);
  assert.ok(detailed.includes('•'));
});
