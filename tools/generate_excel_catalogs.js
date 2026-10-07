/**
 * سكربت متقدم لتوليد كافة قوالب ملفات الإكسل الرسمية (12 نشاط تجاري)
 * لمشروع رفيق POS - Rafiq POS
 */

const fs = require('fs');
const path = require('path');
const xlsx = require(path.resolve(__dirname, '..', 'frontend', 'node_modules', 'xlsx'));

const OUTPUT_DIR = path.resolve(__dirname, '..', 'قوالب_أصناف_المحلات_Excel');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. استخراج الكتالوجات من StoreCatalogSeeder.cs
const seederPath = path.resolve(__dirname, '..', 'desktop', 'Services', 'StoreCatalogSeeder.cs');
const seederContent = fs.readFileSync(seederPath, 'utf8');

function parseMethodProducts(methodName) {
  const target = 'List<TemplateProductItem> ' + methodName;
  const methodStart = seederContent.indexOf(target);
  if (methodStart === -1) {
    console.error(`Method ${methodName} not found!`);
    return [];
  }
  const nextMethod = seederContent.indexOf('private static List<TemplateProductItem>', methodStart + target.length);
  const chunkEnd = nextMethod !== -1 ? nextMethod : seederContent.length;
  const chunk = seederContent.substring(methodStart, chunkEnd);

  const regex = /new\s+TemplateProductItem\s*\{\s*Name\s*=\s*"([^"]+)",\s*Barcode\s*=\s*"([^"]*)",\s*CategoryName\s*=\s*"([^"]+)",\s*PricePiasters\s*=\s*(\d+),\s*CostPiasters\s*=\s*(\d+),\s*StockQuantityMilli\s*=\s*(\d+),\s*MinStockQuantityMilli\s*=\s*(\d+),\s*Unit\s*=\s*"([^"]+)"/g;

  const items = [];
  let m;
  while ((m = regex.exec(chunk)) !== null) {
    items.push({
      name: m[1],
      barcode: m[2],
      category: m[3],
      price: Number((parseInt(m[4], 10) / 100).toFixed(2)),
      cost: Number((parseInt(m[5], 10) / 100).toFixed(2)),
      stock: Math.round(parseInt(m[6], 10) / 1000),
      minStock: Math.round(parseInt(m[7], 10) / 1000),
      unit: m[8] === 'kg' ? 'كجم' : 'قطعة'
    });
  }
  return items;
}

// الكتالوجات الـ 9 المستخرجة من السيستم
const supermarketItems = parseMethodProducts('GetSupermarketCatalog');
const phonesItems = parseMethodProducts('GetPhonesElectronicsCatalog');
const dairyItems = parseMethodProducts('GetDairyBakeryCatalog');
const produceItems = parseMethodProducts('GetProduceButcheryCatalog');
const stationeryItems = parseMethodProducts('GetStationeryGiftsCatalog');
const toysItems = parseMethodProducts('GetToysKidsCatalog');
const spicesItems = parseMethodProducts('GetSpicesRoasteryCatalog');
const clothingItems = parseMethodProducts('GetClothingApparelCatalog');
const groceryItems = parseMethodProducts('GetGeneralGroceryCatalog');

// 2. الكتالوجات الـ 3 التكميلية ذات الجودة الفائقة (صيدليات، حدايد وبويات، مطاعم وكافيهات)
const pharmacyItems = [
  // أدوية ومسكنات عامة OTC
  { name: 'بنادول إكسترا أحمر شريط 12 قرص', barcode: '6221100010015', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 42.0, cost: 34.0, stock: 50, minStock: 10 },
  { name: 'بنادول أزرق خافض حرارة شريط 12 قرص', barcode: '6221100010022', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 35.0, cost: 28.5, stock: 50, minStock: 10 },
  { name: 'كونجستال نزلات برد وإنفلونزا شريط 10 أقراص', barcode: '6221100010039', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 28.0, cost: 22.0, stock: 60, minStock: 12 },
  { name: 'سيتال خافض حرارة للأطفال شراب 120 مل', barcode: '6221100010046', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 18.0, cost: 14.5, stock: 40, minStock: 8 },
  { name: 'بروفين مسكن ومضاد للالتهاب 400 مجم شريط 10 أقراص', barcode: '6221100010053', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 26.0, cost: 21.0, stock: 50, minStock: 10 },
  { name: 'أنتينال كبسول مطهر معوي شريط 12 كبسولة', barcode: '6221100010060', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 32.0, cost: 26.0, stock: 60, minStock: 15 },
  { name: 'ستربسلز استحلاب لالتهاب الحلق عسل وليمون باكت', barcode: '6221100010077', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 95.0, cost: 78.0, stock: 30, minStock: 6 },
  { name: 'أوتريفين بخاخ أنف للبالغين 10 مل', barcode: '6221100010084', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 24.0, cost: 19.0, stock: 40, minStock: 8 },
  { name: 'فوار راني لعلاج الحموضة باكت 6 أكياس', barcode: '6221100010091', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 20.0, cost: 16.0, stock: 50, minStock: 10 },
  { name: 'فوار كول يورين مسالك بولية باكت 6 أكياس', barcode: '6221100010107', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 22.0, cost: 17.5, stock: 40, minStock: 8 },
  { name: 'ألفينترن أقراص مضاد للتورم والالتهاب شريط 10 أقراص', barcode: '6221100010114', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 30.0, cost: 24.5, stock: 50, minStock: 10 },
  { name: 'كتافلام 50 مجم مسكن سريع شريط 10 أقراص', barcode: '6221100010121', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 38.0, cost: 31.0, stock: 50, minStock: 10 },

  // مستلزمات طبية وإسعافات
  { name: 'كحول طبي معقم إيثيلي 70% بخاخ 120 مل', barcode: '6221100020014', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 25.0, cost: 16.0, stock: 60, minStock: 12 },
  { name: 'بيتادين مطهر جروح سائل 60 مل', barcode: '6221100020021', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 45.0, cost: 36.0, stock: 40, minStock: 8 },
  { name: 'قطن طبي ممتص فاخر معقم 100 جم', barcode: '6221100020038', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 22.0, cost: 15.0, stock: 50, minStock: 10 },
  { name: 'شاش طبي معقم باكت 5 قطع', barcode: '6221100020045', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 15.0, cost: 9.5, stock: 60, minStock: 15 },
  { name: 'بلاستر طبي لاصق جروح علبة 50 قطعة', barcode: '6221100020052', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 30.0, cost: 18.0, stock: 40, minStock: 8 },
  { name: 'رباط ضاغط طبي مرن مقاس 10 سم', barcode: '6221100020069', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 20.0, cost: 12.0, stock: 35, minStock: 7 },
  { name: 'ترمومتر رقمي ديجيتال لقياس الحرارة شاشة LCD', barcode: '6221100020076', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 75.0, cost: 48.0, stock: 20, minStock: 4 },
  { name: 'سرنجة طبية معقمة 3 سم سن دقيق كرتونة 100', barcode: '6221100020083', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 2.5, cost: 1.6, stock: 200, minStock: 40 },
  { name: 'سرنجة طبية معقمة 5 سم كرتونة 100', barcode: '6221100020090', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 3.0, cost: 1.9, stock: 200, minStock: 40 },
  { name: 'كمامة طبية 3 طبقات دعامة أنف باكت 50 قطعة', barcode: '6221100020106', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 40.0, cost: 24.0, stock: 50, minStock: 10 },

  // عناية بالأم والطفل
  { name: 'حفاضات بامبرز مقاس 3 عبوة التوفير 58 حفاضة', barcode: '6221100030013', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 290.0, cost: 255.0, stock: 25, minStock: 5 },
  { name: 'حفاضات بامبرز مقاس 4 عبوة جامبو 64 حفاضة', barcode: '6221100030020', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 320.0, cost: 280.0, stock: 25, minStock: 5 },
  { name: 'حفاضات مولفيكس مقاس 3 عبوة 58 حفاضة', barcode: '6221100030037', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 260.0, cost: 228.0, stock: 25, minStock: 5 },
  { name: 'مناديل مبللة جونسون للأطفال بدون كحول 72 منديل', barcode: '6221100030044', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 45.0, cost: 35.0, stock: 40, minStock: 8 },
  { name: 'شامبو جونسون للأطفال لا دموع بعد اليوم 300 مل', barcode: '6221100030051', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 65.0, cost: 52.0, stock: 30, minStock: 6 },
  { name: 'زيت جونسون للأطفال مرطب ناعم 200 مل', barcode: '6221100030068', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 60.0, cost: 48.0, stock: 30, minStock: 6 },
  { name: 'بودرة تلك جونسون للأطفال نقية 200 جم', barcode: '6221100030075', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 50.0, cost: 39.0, stock: 35, minStock: 7 },
  { name: 'كريم سودوكريم لعلاج تسلخات الحفاضات 125 جم', barcode: '6221100030082', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 185.0, cost: 152.0, stock: 20, minStock: 4 },
  { name: 'ببرونة أطفال شيكو زجاجية حلمة سيليكون 150 مل', barcode: '6221100030099', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 95.0, cost: 72.0, stock: 20, minStock: 4 },

  // مستحضرات تجميل وبشرة وشعر
  { name: 'غسول وجه غارنييه سكين أكتيف فيتامين سي 100 مل', barcode: '6221100040012', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 85.0, cost: 68.0, stock: 30, minStock: 6 },
  { name: 'ماء ميسيلار منظف ومزيل مكياج غارنييه 400 مل', barcode: '6221100040029', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 110.0, cost: 89.0, stock: 25, minStock: 5 },
  { name: 'كريم نيفيا سوفت مرطب منعش للجسم والوجه 200 مل', barcode: '6221100040036', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 75.0, cost: 58.0, stock: 35, minStock: 7 },
  { name: 'كريم نيفيا أزرق كلاسيك علبة معدنية 150 مل', barcode: '6221100040043', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 65.0, cost: 51.0, stock: 40, minStock: 8 },
  { name: 'صن بلوك واقي شمس بوباي جل SPF50+ 50 جم', barcode: '6221100040050', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 160.0, cost: 128.0, stock: 20, minStock: 4 },
  { name: 'سيروم شعر سيروبايب كيراتين مضاد للتساقط 100 مل', barcode: '6221100040067', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 195.0, cost: 155.0, stock: 15, minStock: 3 },
  { name: 'حمام كريم شعر فاتيكا بالثوم والنخاع 500 جم', barcode: '6221100040074', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 65.0, cost: 50.0, stock: 30, minStock: 6 },
  { name: 'مزيل عرق ريكسونا بخاخ رجالي 150 مل حماية 48 ساعة', barcode: '6221100040081', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 75.0, cost: 59.0, stock: 35, minStock: 7 },
  { name: 'مزيل عرق نيفيا رول أون حريمي 50 مل حماية جافة', barcode: '6221100040098', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 55.0, cost: 42.0, stock: 40, minStock: 8 },
  { name: 'معجون أسنان سنسوداين للأسنان الحساسة 75 مل', barcode: '6221100040104', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 65.0, cost: 52.0, stock: 35, minStock: 7 },
  { name: 'موس حلاقة جيليت بلو 3 شفرات متحركة كيس 4 قطع', barcode: '6221100040111', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 55.0, cost: 42.0, stock: 40, minStock: 8 }
];

const hardwareToolsItems = [
  // أدوات يدوية ومعدات
  { name: 'شاكوش مخلب مقبض فايبر مانع للانزلاق 500 جم', barcode: '6228800010014', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 120.0, cost: 85.0, stock: 25, minStock: 5 },
  { name: 'بنسة كهرباء يد معزولة 8 بوصة توتال', barcode: '6228800010021', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 95.0, cost: 68.0, stock: 30, minStock: 6 },
  { name: 'مفتاح إنجليزي فرنساوي 10 بوصة متين', barcode: '6228800010038', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 110.0, cost: 78.0, stock: 20, minStock: 4 },
  { name: 'طقم مفكات عادة وصليبة 6 قطع صلب كروم', barcode: '6228800010045', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 140.0, cost: 98.0, stock: 20, minStock: 4 },
  { name: 'متر قياس شريط صلب 5 متر أوتوماتيك توتال', barcode: '6228800010052', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 65.0, cost: 45.0, stock: 40, minStock: 8 },
  { name: 'ميزان مياه ألومنيوم مغناطيسي 40 سم 3 عيون', barcode: '6228800010069', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 85.0, cost: 58.0, stock: 20, minStock: 4 },
  { name: 'مشرط كاتر معدني شفرة عريضة 18 ملم مع غيار', barcode: '6228800010076', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 35.0, cost: 22.0, stock: 50, minStock: 10 },
  { name: 'مسدس شمع لاصق كهربائي 60 وات سريع التسخين', barcode: '6228800010083', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 90.0, cost: 62.0, stock: 25, minStock: 5 },
  { name: 'أصابع شمع سيليكون مسدس باكت 10 صوابع', barcode: '6228800010090', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 30.0, cost: 18.0, stock: 60, minStock: 12 },

  // دهانات وبويات ومستلزماتها
  { name: 'بستلة دهان بلاستيك داخلي GLC مط 3030 أبيض', barcode: '6228800020013', category: 'دهانات وبويات', unit: 'قطعة', price: 420.0, cost: 360.0, stock: 15, minStock: 3 },
  { name: 'بستلة دهان بلاستيك سايبس ناصع البياض مط', barcode: '6228800020020', category: 'دهانات وبويات', unit: 'قطعة', price: 450.0, cost: 385.0, stock: 15, minStock: 3 },
  { name: 'كيلو لاكيه لامع أبيض كابسي ممتاز', barcode: '6228800020037', category: 'دهانات وبويات', unit: 'قطعة', price: 125.0, cost: 102.0, stock: 30, minStock: 6 },
  { name: 'سكينة معجون صلب مرنة يد خشب 4 بوصة', barcode: '6228800020044', category: 'دهانات وبويات', unit: 'قطعة', price: 25.0, cost: 16.0, stock: 50, minStock: 10 },
  { name: 'رول دهان وبوية فايبر كاملة 9 بوصة', barcode: '6228800020051', category: 'دهانات وبويات', unit: 'قطعة', price: 55.0, cost: 38.0, stock: 40, minStock: 8 },
  { name: 'فرشاة دهان شعر طبيعي 3 بوصة توتال', barcode: '6228800020068', category: 'دهانات وبويات', unit: 'قطعة', price: 30.0, cost: 19.0, stock: 45, minStock: 10 },
  { name: 'علبة معجون حوائط جاهز 1 كجم GLC', barcode: '6228800020075', category: 'دهانات وبويات', unit: 'قطعة', price: 35.0, cost: 26.0, stock: 40, minStock: 8 },
  { name: 'رول شريط لاصق ورقي مسكنج تيب 2 بوصة للدهانات', barcode: '6228800020082', category: 'دهانات وبويات', unit: 'قطعة', price: 20.0, cost: 13.0, stock: 60, minStock: 15 },
  { name: 'سبراي رش ألوان دوكو ألوان متعددة علبة 400 مل', barcode: '6228800020099', category: 'دهانات وبويات', unit: 'قطعة', price: 45.0, cost: 32.0, stock: 50, minStock: 10 },

  // كهرباء وإضاءة
  { name: 'لمبة ليد فينوس 9 وات إضاءة بيضاء موفرة', barcode: '6228800030012', category: 'كهرباء وإضاءة', unit: 'قطعة', price: 45.0, cost: 35.0, stock: 60, minStock: 15 },
  { name: 'لمبة ليد فينوس 12 وات إضاءة بيضاء كرتونة', barcode: '6228800030029', category: 'كهرباء وإضاءة', unit: 'قطعة', price: 55.0, cost: 43.0, stock: 50, minStock: 12 },
  { name: 'لمبة ليد بلح فينوس دلاية 4 وات أصفر وورم', barcode: '6228800030036', category: 'كهرباء وإضاءة', unit: 'قطعة', price: 40.0, cost: 30.0, stock: 40, minStock: 8 },
  { name: 'شاسيه مفتاح بريزة كهرباء ساس SAS أبيض', barcode: '6228800030043', category: 'كهرباء وإضاءة', unit: 'قطعة', price: 18.0, cost: 12.5, stock: 60, minStock: 12 },
  { name: 'لقمة بريزة فيشة كهرباء ثلاثية ساس أصلي', barcode: '6228800030050', category: 'كهرباء وإضاءة', unit: 'قطعة', price: 22.0, cost: 16.0, stock: 70, minStock: 15 },
  { name: 'شريط لحام عازل كهرباء شيرتول أصلي 10 متر', barcode: '6228800030067', category: 'كهرباء وإضاءة', unit: 'قطعة', price: 12.0, cost: 7.5, stock: 100, minStock: 25 },
  { name: 'لفة سلك سويدي معتمد نحاس شعر 1.5 ملم 100 متر', barcode: '6228800030074', category: 'كهرباء وإضاءة', unit: 'قطعة', price: 850.0, cost: 760.0, stock: 10, minStock: 2 },
  { name: 'مشترك كهرباء 4 عين مع سلك 3 متر بمفتاح أمان', barcode: '6228800030081', category: 'كهرباء وإضاءة', unit: 'قطعة', price: 110.0, cost: 78.0, stock: 25, minStock: 5 },

  // سباكة ومسامير وتثبيت
  { name: 'شريط تيفلون سباكة أصلي مانع للتسريب لفة', barcode: '6228800040011', category: 'سباكة وتثبيت', unit: 'قطعة', price: 8.0, cost: 4.5, stock: 100, minStock: 20 },
  { name: 'خرطوم سخان مرن إيطالي استانلس ستيل 50 سم', barcode: '6228800040028', category: 'سباكة وتثبيت', unit: 'قطعة', price: 65.0, cost: 46.0, stock: 35, minStock: 7 },
  { name: 'محبس زاوية نحاس ألماني كروم أصلي 1/2 بوصة', barcode: '6228800040035', category: 'سباكة وتثبيت', unit: 'قطعة', price: 85.0, cost: 62.0, stock: 30, minStock: 6 },
  { name: 'أنبوبة سيليكون شفاف تركي مضاد للفطريات 300 مل', barcode: '6228800040042', category: 'سباكة وتثبيت', unit: 'قطعة', price: 75.0, cost: 52.0, stock: 40, minStock: 8 },
  { name: 'باكت فيشر بلاستيك مقاس 6 ملم مع مسامير صلب 50 حبة', barcode: '6228800040059', category: 'سباكة وتثبيت', unit: 'قطعة', price: 25.0, cost: 14.0, stock: 60, minStock: 15 },
  { name: 'باكت مسامير سن صاج 3 سم أسود كرتونة 100 مسمار', barcode: '6228800040066', category: 'سباكة وتثبيت', unit: 'قطعة', price: 20.0, cost: 12.0, stock: 70, minStock: 15 }
];

const restaurantsCafeItems = [
  // ساندوتشات ووجبات
  { name: 'برجر لحم بقري كلاسيك سنجل مع جبنة شيدر', barcode: '5001', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 85.0, cost: 55.0, stock: 100, minStock: 20 },
  { name: 'برجر لحم بقري دبل مع صوص باربكيو مدخن', barcode: '5002', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 125.0, cost: 82.0, stock: 80, minStock: 15 },
  { name: 'ساندوتش تشيكن كريسبي زنجر حار صوص مايونيز', barcode: '5003', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 95.0, cost: 62.0, stock: 90, minStock: 18 },
  { name: 'ساندوتش فاهيتا دجاج مكسيكي بالمشروم والفلفل', barcode: '5004', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 90.0, cost: 58.0, stock: 70, minStock: 15 },
  { name: 'ساندوتش شاورما لحم عربي صوص طحينة', barcode: '5005', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 75.0, cost: 48.0, stock: 100, minStock: 20 },
  { name: 'ساندوتش شاورما فراخ سوري تومية وخيار مخلل', barcode: '5006', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 65.0, cost: 42.0, stock: 120, minStock: 25 },
  { name: 'ساندوتش كفتة مشوية بلدي طحينة وسلطة خضراء', barcode: '5007', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 70.0, cost: 45.0, stock: 80, minStock: 15 },
  { name: 'ساندوتش حواوشي بلدي مخصوص على الفحم', barcode: '5008', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 55.0, cost: 35.0, stock: 90, minStock: 20 },

  // بيتزا ومكرونات
  { name: 'بيتزا مارجريتا إيطالي ريحان وجبنة وسط', barcode: '5010', category: 'بيتزا ومكرونات', unit: 'قطعة', price: 110.0, cost: 68.0, stock: 50, minStock: 10 },
  { name: 'بيتزا سوبر سوبريم ميكس لحوم كبير', barcode: '5011', category: 'بيتزا ومكرونات', unit: 'قطعة', price: 175.0, cost: 110.0, stock: 40, minStock: 8 },
  { name: 'بيتزا تشيكن رانش مع صوص الرانش وسط', barcode: '5012', category: 'بيتزا ومكرونات', unit: 'قطعة', price: 140.0, cost: 88.0, stock: 45, minStock: 10 },
  { name: 'مكرونة نجرسكو دجاج صوص أبيض موتزاريلا', barcode: '5013', category: 'بيتزا ومكرونات', unit: 'قطعة', price: 95.0, cost: 60.0, stock: 50, minStock: 10 },
  { name: 'مكرونة بشاميل باللحم المفروم طاجن', barcode: '5014', category: 'بيتزا ومكرونات', unit: 'قطعة', price: 85.0, cost: 52.0, stock: 50, minStock: 10 },

  // مقبلات وجوانب
  { name: 'بطاطس مقلية فارم فريتس مقرمشة وسط', barcode: '5020', category: 'مقبلات وجوانب', unit: 'قطعة', price: 30.0, cost: 16.0, stock: 150, minStock: 30 },
  { name: 'بطاطس ودجز بالبهارات والأعشاب', barcode: '5021', category: 'مقبلات وجوانب', unit: 'قطعة', price: 40.0, cost: 22.0, stock: 80, minStock: 15 },
  { name: 'أصابع جبنة موتزاريلا مقلية (4 قطع)', barcode: '5022', category: 'مقبلات وجوانب', unit: 'قطعة', price: 50.0, cost: 30.0, stock: 70, minStock: 15 },
  { name: 'حلقات بصل مقرمشة مع صوص حار (6 قطع)', barcode: '5023', category: 'مقبلات وجوانب', unit: 'قطعة', price: 35.0, cost: 18.0, stock: 60, minStock: 12 },
  { name: 'علبة صوص تومية سوري ممتازة', barcode: '5024', category: 'مقبلات وجوانب', unit: 'قطعة', price: 15.0, cost: 7.0, stock: 100, minStock: 20 },
  { name: 'علبة صوص جبنة شيدر سائلة دافئة', barcode: '5025', category: 'مقبلات وجوانب', unit: 'قطعة', price: 20.0, cost: 10.0, stock: 90, minStock: 20 },

  // مشروبات ساخنة
  { name: 'إسبريسو سنجل شوت إيطالي فاخر', barcode: '5030', category: 'مشروبات ساخنة', unit: 'قطعة', price: 35.0, cost: 12.0, stock: 200, minStock: 30 },
  { name: 'إسبريسو دبل شوت إيطالي قوي', barcode: '5031', category: 'مشروبات ساخنة', unit: 'قطعة', price: 50.0, cost: 18.0, stock: 200, minStock: 30 },
  { name: 'كابتشينو حليب مبخر رغوة غنية', barcode: '5032', category: 'مشروبات ساخنة', unit: 'قطعة', price: 55.0, cost: 24.0, stock: 150, minStock: 25 },
  { name: 'كافيه لاتيه حليب دافئ كريمي', barcode: '5033', category: 'مشروبات ساخنة', unit: 'قطعة', price: 55.0, cost: 24.0, stock: 150, minStock: 25 },
  { name: 'قهوة تركي بن محوج فنجان مظبوط', barcode: '5034', category: 'مشروبات ساخنة', unit: 'قطعة', price: 30.0, cost: 10.0, stock: 250, minStock: 40 },
  { name: 'شاي أحمر إبريق صغير بالنعناع الطازج', barcode: '5035', category: 'مشروبات ساخنة', unit: 'قطعة', price: 20.0, cost: 5.0, stock: 300, minStock: 50 },
  { name: 'هوت تشوكليت شوكولاتة بلجيكية فاخرة بالمارشميلو', barcode: '5036', category: 'مشروبات ساخنة', unit: 'قطعة', price: 60.0, cost: 28.0, stock: 100, minStock: 20 },

  // مشروبات باردة وعصائر
  { name: 'آيس لاتيه كراميل مثلج', barcode: '5040', category: 'مشروبات باردة', unit: 'قطعة', price: 65.0, cost: 28.0, stock: 120, minStock: 20 },
  { name: 'آيس سبانش لاتيه حليب مكثف', barcode: '5041', category: 'مشروبات باردة', unit: 'قطعة', price: 75.0, cost: 32.0, stock: 100, minStock: 20 },
  { name: 'موهيتو ليمون ونعناع صودا منعشة', barcode: '5042', category: 'مشروبات باردة', unit: 'قطعة', price: 45.0, cost: 16.0, stock: 150, minStock: 25 },
  { name: 'موهيتو فراولة وبلو بيري', barcode: '5043', category: 'مشروبات باردة', unit: 'قطعة', price: 50.0, cost: 18.0, stock: 120, minStock: 20 },
  { name: 'عصير مانجو طبيعي طازج بدون ماء إضافي', barcode: '5044', category: 'مشروبات باردة', unit: 'قطعة', price: 45.0, cost: 20.0, stock: 100, minStock: 20 },
  { name: 'عصير برتقال فريش طبيعي 100%', barcode: '5045', category: 'مشروبات باردة', unit: 'قطعة', price: 40.0, cost: 16.0, stock: 100, minStock: 20 },
  { name: 'كانز مياه غازية 330 مل باردة', barcode: '5046', category: 'مشروبات باردة', unit: 'قطعة', price: 20.0, cost: 12.0, stock: 150, minStock: 30 },
  { name: 'زجاجة مياه معدنية 600 مل', barcode: '5047', category: 'مشروبات باردة', unit: 'قطعة', price: 10.0, cost: 4.5, stock: 200, minStock: 40 }
];

// دالة كتابة ملف إكسل منسق باحترافية
function exportExcelFile(fileName, sheetTitle, items) {
  const rows = items.map((item, idx) => ({
    'اسم الصنف': item.name,
    'الباركود الرئيسي': item.barcode || '',
    'القسم / التصنيف': item.category || 'عام',
    'الوحدة': item.unit || 'قطعة',
    'سعر البيع': Number(item.price || 0),
    'سعر التكلفة': Number(item.cost || 0),
    'الرصيد الافتتاحي': Number(item.stock || 0),
    'حد الطلب الأدنى': Number(item.minStock || 0),
    'كود الصنف الداخلي': item.internalCode || `SKU-${String(idx + 1).padStart(4, '0')}`
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows, {
    header: [
      'اسم الصنف',
      'الباركود الرئيسي',
      'القسم / التصنيف',
      'الوحدة',
      'سعر البيع',
      'سعر التكلفة',
      'الرصيد الافتتاحي',
      'حد الطلب الأدنى',
      'كود الصنف الداخلي'
    ]
  });

  // عرض الأعمدة المتناسق والمهندَم
  ws['!cols'] = [
    { wch: 44 }, // اسم الصنف
    { wch: 20 }, // الباركود الرئيسي
    { wch: 24 }, // القسم / التصنيف
    { wch: 10 }, // الوحدة
    { wch: 14 }, // سعر البيع
    { wch: 14 }, // سعر التكلفة
    { wch: 16 }, // الرصيد الافتتاحي
    { wch: 16 }, // حد الطلب الأدنى
    { wch: 18 }  // كود الصنف الداخلي
  ];

  // دعم اتجاه RTL العربي الأصيل
  ws['!views'] = [{ rightToLeft: true }];

  xlsx.utils.book_append_sheet(wb, ws, sheetTitle);

  const fullPath = path.join(OUTPUT_DIR, fileName);
  xlsx.writeFile(wb, fullPath, { bookType: 'xlsx', compression: true });
  console.log(`[تم التصدير بنجاح] ${fileName} (${items.length} صنف)`);
}

// تشغيل التوليد لكافة الكتالوجات الـ 12
console.log('--- بدء توليد ملفات الإكسل الرسمية لكافة المحلات ---');

exportExcelFile('01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx', 'أصناف السوبرماركت', supermarketItems);
exportExcelFile('02_محلات_هواتف_وموبايل_وإلكترونيات.xlsx', 'هواتف وإلكترونيات', phonesItems);
exportExcelFile('03_خضار_وفاكهة_ولحوم_وجزارة.xlsx', 'خضار وفواكه ولحوم', produceItems);
exportExcelFile('04_ألبان_ومخبوزات_ومعلبات.xlsx', 'ألبان ومخبوزات', dairyItems);
exportExcelFile('05_مكتبات_وقرطاسية_وأدوات_مدرسية.xlsx', 'مكتبة وقرطاسية', stationeryItems);
exportExcelFile('06_ألعاب_أطفال_وهدايا.xlsx', 'ألعاب أطفال وهدايا', toysItems);
exportExcelFile('07_عطارة_ومحامص_وبن_وبهارات.xlsx', 'عطارة ومحامص وبن', spicesItems);
exportExcelFile('08_ملابس_وأحذية_وأزياء.xlsx', 'ملابس وأزياء', clothingItems);
exportExcelFile('09_صيدليات_ومستحضرات_تجميل_وعناية.xlsx', 'أدوية ومستحضرات تجميل', pharmacyItems);
exportExcelFile('10_حدايد_وبويات_وأدوات_كهربائية_وسباكة.xlsx', 'حدايد وبويات وكهرباء', hardwareToolsItems);
exportExcelFile('11_مطاعم_وكافيهات_ووجبات_سريعة.xlsx', 'مطاعم وكافيهات', restaurantsCafeItems);
exportExcelFile('12_محل_تجاري_عام_ومتنوع.xlsx', 'محل تجاري عام', groceryItems);

console.log('--- تم الانتهاء بنجاح من توليد كافة ملفات الإكسل ---');
