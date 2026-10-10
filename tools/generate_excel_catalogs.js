/**
 * سكربت متقدم لتوليد كافة قوالب ملفات الإكسل الرسمية (12 نشاط تجاري)
 * متطابقة 100% مع النموذج المعتمد لنظام رفيق POS (Rafiq POS)
 * تدعم الألوان والمقاسات والباركودات والأكواد الداخلية لجميع الأنشطة
 */

const fs = require('fs');
const path = require('path');
const xlsx = require(path.resolve(__dirname, '..', 'frontend', 'node_modules', 'xlsx'));

const OUTPUT_DIR = path.resolve(__dirname, '..', 'قوالب_أصناف_المحلات_Excel');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. استخراج الكتالوجات الأساسية من StoreCatalogSeeder.cs
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
  let idx = 1;
  while ((m = regex.exec(chunk)) !== null) {
    items.push({
      name: m[1],
      barcode: m[2],
      additionalBarcodes: '',
      category: m[3],
      unit: m[8] === 'kg' ? 'كجم' : 'قطعة',
      color: '',
      size: '',
      price: Number((parseInt(m[4], 10) / 100).toFixed(2)),
      cost: Number((parseInt(m[5], 10) / 100).toFixed(2)),
      stock: Math.round(parseInt(m[6], 10) / 1000),
      minStock: Math.round(parseInt(m[7], 10) / 1000),
      taxRate: 0,
      sku: `SKU-${String(idx++).padStart(4, '0')}`,
      taxCategoryCode: ''
    });
  }
  return items;
}

// الكتالوجات المستخرجة
const supermarketItems = parseMethodProducts('GetSupermarketCatalog');
const rawPhonesItems = parseMethodProducts('GetPhonesElectronicsCatalog');
const dairyItems = parseMethodProducts('GetDairyBakeryCatalog');
const produceItems = parseMethodProducts('GetProduceButcheryCatalog');
const stationeryItems = parseMethodProducts('GetStationeryGiftsCatalog');
const toysItems = parseMethodProducts('GetToysKidsCatalog');
const spicesItems = parseMethodProducts('GetSpicesRoasteryCatalog');
const groceryItems = parseMethodProducts('GetGeneralGroceryCatalog');

// تحسين كتالوج الهواتف والإلكترونيات بإضافة الألوان والمقاسات للإكسسوارات والجرابات
const phonesItems = rawPhonesItems.map((item, idx) => {
  let color = '';
  let size = '';
  if (item.name.includes('جراب سيليكون')) {
    color = 'شفاف';
    size = 'آيفون 13/14';
  } else if (item.name.includes('لاصقة حماية')) {
    color = 'شفاف';
    size = 'شاشة 6.7 بوصة';
  } else if (item.name.includes('سماعة بلوتوث')) {
    color = 'أبيض';
  } else if (item.name.includes('كابل شحن')) {
    color = 'أبيض';
    size = '1.2 متر';
  } else if (item.name.includes('باور بانك')) {
    color = 'أسود';
    size = '20000 مللي';
  } else if (item.name.includes('ساعة ذكية')) {
    color = 'أسود';
    size = '44 مم';
  }
  return {
    ...item,
    color,
    size,
    sku: `PHN-${String(idx + 1).padStart(4, '0')}`
  };
});

// 2. كتالوج الملابس والأحذية والأزياء الشامل والمتكامل مع المقاسات والألوان (116 صنف ومتغير واقعي)
const clothingItems = [
  // ملابس رجالي - تيشيرتات قطن سادة رقبة دائرية
  { name: 'تيشيرت قطن سادة رجالي رقبة دائرية', barcode: '6225501100011', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'M', price: 150.0, cost: 95.0, stock: 15, minStock: 3, sku: 'TSH-BLK-M' },
  { name: 'تيشيرت قطن سادة رجالي رقبة دائرية', barcode: '6225501100012', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'L', price: 150.0, cost: 95.0, stock: 20, minStock: 4, sku: 'TSH-BLK-L' },
  { name: 'تيشيرت قطن سادة رجالي رقبة دائرية', barcode: '6225501100013', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'XL', price: 150.0, cost: 95.0, stock: 18, minStock: 3, sku: 'TSH-BLK-XL' },
  { name: 'تيشيرت قطن سادة رجالي رقبة دائرية', barcode: '6225501100014', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: 'M', price: 150.0, cost: 95.0, stock: 15, minStock: 3, sku: 'TSH-WHT-M' },
  { name: 'تيشيرت قطن سادة رجالي رقبة دائرية', barcode: '6225501100015', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: 'L', price: 150.0, cost: 95.0, stock: 25, minStock: 5, sku: 'TSH-WHT-L' },
  { name: 'تيشيرت قطن سادة رجالي رقبة دائرية', barcode: '6225501100016', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: 'XL', price: 150.0, cost: 95.0, stock: 20, minStock: 4, sku: 'TSH-WHT-XL' },
  { name: 'تيشيرت قطن سادة رجالي رقبة دائرية', barcode: '6225501100017', category: 'ملابس رجالي', unit: 'قطعة', color: 'كحلي', size: 'L', price: 150.0, cost: 95.0, stock: 20, minStock: 4, sku: 'TSH-NVY-L' },
  { name: 'تيشيرت قطن سادة رجالي رقبة دائرية', barcode: '6225501100018', category: 'ملابس رجالي', unit: 'قطعة', color: 'رمادي', size: 'L', price: 150.0, cost: 95.0, stock: 15, minStock: 3, sku: 'TSH-GRY-L' },

  // ملابس رجالي - تيشيرت بولو كاجوال بيكيه
  { name: 'تيشيرت بولو كاجوال رجالي بيكيه نص كم', barcode: '6225501100021', category: 'ملابس رجالي', unit: 'قطعة', color: 'كحلي', size: 'M', price: 220.0, cost: 140.0, stock: 12, minStock: 3, sku: 'POLO-NVY-M' },
  { name: 'تيشيرت بولو كاجوال رجالي بيكيه نص كم', barcode: '6225501100022', category: 'ملابس رجالي', unit: 'قطعة', color: 'كحلي', size: 'L', price: 220.0, cost: 140.0, stock: 18, minStock: 4, sku: 'POLO-NVY-L' },
  { name: 'تيشيرت بولو كاجوال رجالي بيكيه نص كم', barcode: '6225501100023', category: 'ملابس رجالي', unit: 'قطعة', color: 'كحلي', size: 'XL', price: 220.0, cost: 140.0, stock: 15, minStock: 3, sku: 'POLO-NVY-XL' },
  { name: 'تيشيرت بولو كاجوال رجالي بيكيه نص كم', barcode: '6225501100024', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'L', price: 220.0, cost: 140.0, stock: 16, minStock: 3, sku: 'POLO-BLK-L' },
  { name: 'تيشيرت بولو كاجوال رجالي بيكيه نص كم', barcode: '6225501100025', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'XL', price: 220.0, cost: 140.0, stock: 14, minStock: 3, sku: 'POLO-BLK-XL' },
  { name: 'تيشيرت بولو كاجوال رجالي بيكيه نص كم', barcode: '6225501100026', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: 'L', price: 220.0, cost: 140.0, stock: 15, minStock: 3, sku: 'POLO-WHT-L' },
  { name: 'تيشيرت بولو كاجوال رجالي بيكيه نص كم', barcode: '6225501100027', category: 'ملابس رجالي', unit: 'قطعة', color: 'عنابي', size: 'L', price: 220.0, cost: 140.0, stock: 12, minStock: 2, sku: 'POLO-BUR-L' },

  // ملابس رجالي - قمصان
  { name: 'قميص أكسفورد قطن كاجوال سليم فيت رجالي', barcode: '6225501100031', category: 'ملابس رجالي', unit: 'قطعة', color: 'سماوي', size: 'M', price: 280.0, cost: 180.0, stock: 10, minStock: 2, sku: 'SHT-SKY-M' },
  { name: 'قميص أكسفورد قطن كاجوال سليم فيت رجالي', barcode: '6225501100032', category: 'ملابس رجالي', unit: 'قطعة', color: 'سماوي', size: 'L', price: 280.0, cost: 180.0, stock: 15, minStock: 3, sku: 'SHT-SKY-L' },
  { name: 'قميص أكسفورد قطن كاجوال سليم فيت رجالي', barcode: '6225501100033', category: 'ملابس رجالي', unit: 'قطعة', color: 'سماوي', size: 'XL', price: 280.0, cost: 180.0, stock: 12, minStock: 2, sku: 'SHT-SKY-XL' },
  { name: 'قميص أكسفورد قطن كاجوال سليم فيت رجالي', barcode: '6225501100034', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: 'L', price: 280.0, cost: 180.0, stock: 14, minStock: 3, sku: 'SHT-WHT-L' },
  { name: 'قميص أكسفورد قطن كاجوال سليم فيت رجالي', barcode: '6225501100035', category: 'ملابس رجالي', unit: 'قطعة', color: 'رمادي', size: 'L', price: 280.0, cost: 180.0, stock: 10, minStock: 2, sku: 'SHT-GRY-L' },
  { name: 'قميص كلاسيك أبيض للمناسبات والبدل', barcode: '6225501100041', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: '40', price: 320.0, cost: 210.0, stock: 8, minStock: 2, sku: 'SHT-CLS-40' },
  { name: 'قميص كلاسيك أبيض للمناسبات والبدل', barcode: '6225501100042', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: '42', price: 320.0, cost: 210.0, stock: 12, minStock: 2, sku: 'SHT-CLS-42' },
  { name: 'قميص كلاسيك أبيض للمناسبات والبدل', barcode: '6225501100043', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: '44', price: 320.0, cost: 210.0, stock: 10, minStock: 2, sku: 'SHT-CLS-44' },

  // ملابس رجالي - بنطلونات
  { name: 'بنطلون جينز رجالي أزرق غامق مريح', barcode: '6225501100051', category: 'ملابس رجالي', unit: 'قطعة', color: 'أزرق غامق', size: '32', price: 350.0, cost: 230.0, stock: 8, minStock: 2, sku: 'JNS-DNM-32' },
  { name: 'بنطلون جينز رجالي أزرق غامق مريح', barcode: '6225501100052', category: 'ملابس رجالي', unit: 'قطعة', color: 'أزرق غامق', size: '34', price: 350.0, cost: 230.0, stock: 12, minStock: 3, sku: 'JNS-DNM-34' },
  { name: 'بنطلون جينز رجالي أزرق غامق مريح', barcode: '6225501100053', category: 'ملابس رجالي', unit: 'قطعة', color: 'أزرق غامق', size: '36', price: 350.0, cost: 230.0, stock: 12, minStock: 3, sku: 'JNS-DNM-36' },
  { name: 'بنطلون جينز رجالي أزرق غامق مريح', barcode: '6225501100054', category: 'ملابس رجالي', unit: 'قطعة', color: 'أزرق غامق', size: '38', price: 350.0, cost: 230.0, stock: 8, minStock: 2, sku: 'JNS-DNM-38' },
  { name: 'بنطلون جبردين كلاسيك رجالي مريح', barcode: '6225501100061', category: 'ملابس رجالي', unit: 'قطعة', color: 'كحلي', size: '32', price: 300.0, cost: 195.0, stock: 10, minStock: 2, sku: 'GAB-NVY-32' },
  { name: 'بنطلون جبردين كلاسيك رجالي مريح', barcode: '6225501100062', category: 'ملابس رجالي', unit: 'قطعة', color: 'كحلي', size: '34', price: 300.0, cost: 195.0, stock: 12, minStock: 3, sku: 'GAB-NVY-34' },
  { name: 'بنطلون جبردين كلاسيك رجالي مريح', barcode: '6225501100063', category: 'ملابس رجالي', unit: 'قطعة', color: 'بيج', size: '32', price: 300.0, cost: 195.0, stock: 10, minStock: 2, sku: 'GAB-BEI-32' },
  { name: 'بنطلون جبردين كلاسيك رجالي مريح', barcode: '6225501100064', category: 'ملابس رجالي', unit: 'قطعة', color: 'بيج', size: '34', price: 300.0, cost: 195.0, stock: 12, minStock: 3, sku: 'GAB-BEI-34' },
  { name: 'بنطلون جبردين كلاسيك رجالي مريح', barcode: '6225501100065', category: 'ملابس رجالي', unit: 'قطعة', color: 'زيتي', size: '34', price: 300.0, cost: 195.0, stock: 8, minStock: 2, sku: 'GAB-OLV-34' },

  // ملابس رجالي - هودي وجواكت
  { name: 'سويت شيرت هودي رجالي ميلتون شتوي', barcode: '6225501100071', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'L', price: 340.0, cost: 220.0, stock: 10, minStock: 2, sku: 'HOD-BLK-L' },
  { name: 'سويت شيرت هودي رجالي ميلتون شتوي', barcode: '6225501100072', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'XL', price: 340.0, cost: 220.0, stock: 12, minStock: 3, sku: 'HOD-BLK-XL' },
  { name: 'سويت شيرت هودي رجالي ميلتون شتوي', barcode: '6225501100073', category: 'ملابس رجالي', unit: 'قطعة', color: 'رمادي', size: 'L', price: 340.0, cost: 220.0, stock: 10, minStock: 2, sku: 'HOD-GRY-L' },
  { name: 'سويت شيرت هودي رجالي ميلتون شتوي', barcode: '6225501100074', category: 'ملابس رجالي', unit: 'قطعة', color: 'كحلي', size: 'XL', price: 340.0, cost: 220.0, stock: 8, minStock: 2, sku: 'HOD-NVY-XL' },
  { name: 'جاكيت ووتر بروف رجالي كاجوال خفيف', barcode: '6225501100081', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'L', price: 480.0, cost: 320.0, stock: 8, minStock: 2, sku: 'JKT-BLK-L' },
  { name: 'جاكيت ووتر بروف رجالي كاجوال خفيف', barcode: '6225501100082', category: 'ملابس رجالي', unit: 'قطعة', color: 'أسود', size: 'XL', price: 480.0, cost: 320.0, stock: 8, minStock: 2, sku: 'JKT-BLK-XL' },
  { name: 'جاكيت ووتر بروف رجالي كاجوال خفيف', barcode: '6225501100083', category: 'ملابس رجالي', unit: 'قطعة', color: 'زيتي', size: 'L', price: 480.0, cost: 320.0, stock: 6, minStock: 2, sku: 'JKT-OLV-L' },

  // ملابس رجالي داخلية
  { name: 'بوكسر قطن رجالي دايس طقم 3 قطع', barcode: '6225501100091', category: 'ملابس رجالي', unit: 'قطعة', color: 'ألوان مشكلة', size: 'L', price: 120.0, cost: 80.0, stock: 25, minStock: 5, sku: 'UND-BOX-L' },
  { name: 'بوكسر قطن رجالي دايس طقم 3 قطع', barcode: '6225501100092', category: 'ملابس رجالي', unit: 'قطعة', color: 'ألوان مشكلة', size: 'XL', price: 120.0, cost: 80.0, stock: 30, minStock: 6, sku: 'UND-BOX-XL' },
  { name: 'بوكسر قطن رجالي دايس طقم 3 قطع', barcode: '6225501100093', category: 'ملابس رجالي', unit: 'قطعة', color: 'ألوان مشكلة', size: 'XXL', price: 120.0, cost: 80.0, stock: 20, minStock: 4, sku: 'UND-BOX-XXL' },
  { name: 'فانلة داخلية قطن رجالي دايس نصف كم', barcode: '6225501101017', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: 'L', price: 85.0, cost: 55.0, stock: 35, minStock: 7, sku: 'UND-VNT-L' },
  { name: 'فانلة داخلية قطن رجالي دايس نصف كم', barcode: '6225501101024', category: 'ملابس رجالي', unit: 'قطعة', color: 'أبيض', size: 'XL', price: 85.0, cost: 55.0, stock: 30, minStock: 6, sku: 'UND-VNT-XL' },

  // ملابس حريمي - فساتين وبلوزات
  { name: 'فستان كاجوال حريمي صيفي ناعم مطبوع', barcode: '6225502200011', category: 'ملابس حريمي', unit: 'قطعة', color: 'كحلي', size: 'M', price: 380.0, cost: 245.0, stock: 8, minStock: 2, sku: 'DRS-NVY-M' },
  { name: 'فستان كاجوال حريمي صيفي ناعم مطبوع', barcode: '6225502200012', category: 'ملابس حريمي', unit: 'قطعة', color: 'كحلي', size: 'L', price: 380.0, cost: 245.0, stock: 10, minStock: 2, sku: 'DRS-NVY-L' },
  { name: 'فستان كاجوال حريمي صيفي ناعم مطبوع', barcode: '6225502200013', category: 'ملابس حريمي', unit: 'قطعة', color: 'أحمر', size: 'M', price: 380.0, cost: 245.0, stock: 8, minStock: 2, sku: 'DRS-RED-M' },
  { name: 'فستان كاجوال حريمي صيفي ناعم مطبوع', barcode: '6225502200014', category: 'ملابس حريمي', unit: 'قطعة', color: 'أحمر', size: 'L', price: 380.0, cost: 245.0, stock: 10, minStock: 2, sku: 'DRS-RED-L' },
  { name: 'بلوزة حرير شيفون حريمي أنيقة خروج', barcode: '6225502200021', category: 'ملابس حريمي', unit: 'قطعة', color: 'بيج', size: 'M', price: 260.0, cost: 165.0, stock: 10, minStock: 2, sku: 'BLZ-BEI-M' },
  { name: 'بلوزة حرير شيفون حريمي أنيقة خروج', barcode: '6225502200022', category: 'ملابس حريمي', unit: 'قطعة', color: 'بيج', size: 'L', price: 260.0, cost: 165.0, stock: 12, minStock: 2, sku: 'BLZ-BEI-L' },
  { name: 'بلوزة حرير شيفون حريمي أنيقة خروج', barcode: '6225502200023', category: 'ملابس حريمي', unit: 'قطعة', color: 'أسود', size: 'M', price: 260.0, cost: 165.0, stock: 10, minStock: 2, sku: 'BLZ-BLK-M' },
  { name: 'بلوزة حرير شيفون حريمي أنيقة خروج', barcode: '6225502200024', category: 'ملابس حريمي', unit: 'قطعة', color: 'كشمير', size: 'L', price: 260.0, cost: 165.0, stock: 12, minStock: 2, sku: 'BLZ-CSH-L' },

  // ملابس حريمي - بنطلونات وعبايات
  { name: 'بنطلون جينز حريمي هاي ويست ستريت', barcode: '6225502200031', category: 'ملابس حريمي', unit: 'قطعة', color: 'أزرق فاتح', size: '38', price: 320.0, cost: 210.0, stock: 10, minStock: 2, sku: 'JNW-LBL-38' },
  { name: 'بنطلون جينز حريمي هاي ويست ستريت', barcode: '6225502200032', category: 'ملابس حريمي', unit: 'قطعة', color: 'أزرق فاتح', size: '40', price: 320.0, cost: 210.0, stock: 12, minStock: 2, sku: 'JNW-LBL-40' },
  { name: 'بنطلون جينز حريمي هاي ويست ستريت', barcode: '6225502200033', category: 'ملابس حريمي', unit: 'قطعة', color: 'أسود', size: '38', price: 320.0, cost: 210.0, stock: 10, minStock: 2, sku: 'JNW-BLK-38' },
  { name: 'بنطلون جينز حريمي هاي ويست ستريت', barcode: '6225502200034', category: 'ملابس حريمي', unit: 'قطعة', color: 'أسود', size: '40', price: 320.0, cost: 210.0, stock: 10, minStock: 2, sku: 'JNW-BLK-40' },
  { name: 'عباية خروج سوداء قماش كريب فاخر كوري', barcode: '6225502200041', category: 'ملابس حريمي', unit: 'قطعة', color: 'أسود', size: '54', price: 550.0, cost: 360.0, stock: 6, minStock: 1, sku: 'ABY-BLK-54' },
  { name: 'عباية خروج سوداء قماش كريب فاخر كوري', barcode: '6225502200042', category: 'ملابس حريمي', unit: 'قطعة', color: 'أسود', size: '56', price: 550.0, cost: 360.0, stock: 8, minStock: 2, sku: 'ABY-BLK-56' },
  { name: 'عباية خروج سوداء قماش كريب فاخر كوري', barcode: '6225502200043', category: 'ملابس حريمي', unit: 'قطعة', color: 'أسود', size: '58', price: 550.0, cost: 360.0, stock: 6, minStock: 1, sku: 'ABY-BLK-58' },
  { name: 'عباية بيتي قطن نص كم مريحة', barcode: '6225502200051', category: 'ملابس حريمي', unit: 'قطعة', color: 'موف', size: 'Free Size', price: 280.0, cost: 180.0, stock: 12, minStock: 2, sku: 'ABH-MOV-FS' },
  { name: 'عباية بيتي قطن نص كم مريحة', barcode: '6225502200052', category: 'ملابس حريمي', unit: 'قطعة', color: 'فيروزي', size: 'Free Size', price: 280.0, cost: 180.0, stock: 12, minStock: 2, sku: 'ABH-TRQ-FS' },
  { name: 'بيجامة قطن حريمي صيفي ناعمة قطعتين', barcode: '6225502200061', category: 'ملابس حريمي', unit: 'قطعة', color: 'وردي', size: 'M', price: 240.0, cost: 150.0, stock: 10, minStock: 2, sku: 'PJM-PNK-M' },
  { name: 'بيجامة قطن حريمي صيفي ناعمة قطعتين', barcode: '6225502200062', category: 'ملابس حريمي', unit: 'قطعة', color: 'وردي', size: 'L', price: 240.0, cost: 150.0, stock: 12, minStock: 2, sku: 'PJM-PNK-L' },
  { name: 'بيجامة قطن حريمي صيفي ناعمة قطعتين', barcode: '6225502200063', category: 'ملابس حريمي', unit: 'قطعة', color: 'كحلي', size: 'L', price: 240.0, cost: 150.0, stock: 10, minStock: 2, sku: 'PJM-NVY-L' },
  { name: 'سويت شيرت حريمي أوفر سايز ميلتون', barcode: '6225502200071', category: 'ملابس حريمي', unit: 'قطعة', color: 'لافندر', size: 'M-L', price: 320.0, cost: 200.0, stock: 10, minStock: 2, sku: 'SHT-LAV-ML' },
  { name: 'سويت شيرت حريمي أوفر سايز ميلتون', barcode: '6225502200072', category: 'ملابس حريمي', unit: 'قطعة', color: 'بيج', size: 'M-L', price: 320.0, cost: 200.0, stock: 10, minStock: 2, sku: 'SHT-BEI-ML' },
  { name: 'كارديجان صوف حريمي طويل شتوي', barcode: '6225502200081', category: 'ملابس حريمي', unit: 'قطعة', color: 'رمادي', size: 'One Size', price: 360.0, cost: 230.0, stock: 8, minStock: 2, sku: 'CRD-GRY-OS' },
  { name: 'كارديجان صوف حريمي طويل شتوي', barcode: '6225502200082', category: 'ملابس حريمي', unit: 'قطعة', color: 'جملي', size: 'One Size', price: 360.0, cost: 230.0, stock: 8, minStock: 2, sku: 'CRD-CAM-OS' },
  { name: 'شميز حريمي قطن كاجوال طويل للمحجبات', barcode: '6225502200091', category: 'ملابس حريمي', unit: 'قطعة', color: 'أبيض', size: '42', price: 290.0, cost: 185.0, stock: 10, minStock: 2, sku: 'SHM-WHT-42' },
  { name: 'شميز حريمي قطن كاجوال طويل للمحجبات', barcode: '6225502200092', category: 'ملابس حريمي', unit: 'قطعة', color: 'زيتوني', size: '42', price: 290.0, cost: 185.0, stock: 10, minStock: 2, sku: 'SHM-OLV-42' },

  // ملابس أطفال
  { name: 'تيشيرت أطفال قطن رسومات كرتونية مرحة', barcode: '6225503300011', category: 'ملابس أطفال', unit: 'قطعة', color: 'أصفر', size: '4', price: 110.0, cost: 65.0, stock: 15, minStock: 3, sku: 'KTS-YEL-04' },
  { name: 'تيشيرت أطفال قطن رسومات كرتونية مرحة', barcode: '6225503300012', category: 'ملابس أطفال', unit: 'قطعة', color: 'أصفر', size: '6', price: 110.0, cost: 65.0, stock: 18, minStock: 3, sku: 'KTS-YEL-06' },
  { name: 'تيشيرت أطفال قطن رسومات كرتونية مرحة', barcode: '6225503300013', category: 'ملابس أطفال', unit: 'قطعة', color: 'أزرق', size: '6', price: 110.0, cost: 65.0, stock: 18, minStock: 3, sku: 'KTS-BLU-06' },
  { name: 'تيشيرت أطفال قطن رسومات كرتونية مرحة', barcode: '6225503300014', category: 'ملابس أطفال', unit: 'قطعة', color: 'أزرق', size: '8', price: 110.0, cost: 65.0, stock: 15, minStock: 3, sku: 'KTS-BLU-08' },
  { name: 'ترنج أطفال رياضي قطعتين شتوي ميلتون', barcode: '6225503300021', category: 'ملابس أطفال', unit: 'قطعة', color: 'كحلي', size: '6', price: 260.0, cost: 165.0, stock: 10, minStock: 2, sku: 'KTR-NVY-06' },
  { name: 'ترنج أطفال رياضي قطعتين شتوي ميلتون', barcode: '6225503300022', category: 'ملابس أطفال', unit: 'قطعة', color: 'كحلي', size: '8', price: 260.0, cost: 165.0, stock: 12, minStock: 2, sku: 'KTR-NVY-08' },
  { name: 'ترنج أطفال رياضي قطعتين شتوي ميلتون', barcode: '6225503300023', category: 'ملابس أطفال', unit: 'قطعة', color: 'رمادي', size: '8', price: 260.0, cost: 165.0, stock: 12, minStock: 2, sku: 'KTR-GRY-08' },
  { name: 'ترنج أطفال رياضي قطعتين شتوي ميلتون', barcode: '6225503300024', category: 'ملابس أطفال', unit: 'قطعة', color: 'رمادي', size: '10', price: 260.0, cost: 165.0, stock: 10, minStock: 2, sku: 'KTR-GRY-10' },
  { name: 'ترنج أطفال قطن صيفي شورت وتيشيرت', barcode: '6225503300031', category: 'ملابس أطفال', unit: 'قطعة', color: 'أحمر', size: '4', price: 180.0, cost: 110.0, stock: 12, minStock: 2, sku: 'KTS-RED-04' },
  { name: 'ترنج أطفال قطن صيفي شورت وتيشيرت', barcode: '6225503300032', category: 'ملابس أطفال', unit: 'قطعة', color: 'أحمر', size: '6', price: 180.0, cost: 110.0, stock: 15, minStock: 3, sku: 'KTS-RED-06' },
  { name: 'ترنج أطفال قطن صيفي شورت وتيشيرت', barcode: '6225503300033', category: 'ملابس أطفال', unit: 'قطعة', color: 'تركواز', size: '6', price: 180.0, cost: 110.0, stock: 15, minStock: 3, sku: 'KTS-TRQ-06' },
  { name: 'شورت أطفال جينز مريح بأستك', barcode: '6225503300041', category: 'ملابس أطفال', unit: 'قطعة', color: 'أزرق', size: '6', price: 140.0, cost: 85.0, stock: 15, minStock: 3, sku: 'KSH-BLU-06' },
  { name: 'شورت أطفال جينز مريح بأستك', barcode: '6225503300042', category: 'ملابس أطفال', unit: 'قطعة', color: 'أزرق', size: '8', price: 140.0, cost: 85.0, stock: 15, minStock: 3, sku: 'KSH-BLU-08' },
  { name: 'فستان بناتي صيفي منفوش قطن', barcode: '6225503300051', category: 'ملابس أطفال', unit: 'قطعة', color: 'فوشيا', size: '4', price: 220.0, cost: 135.0, stock: 10, minStock: 2, sku: 'GDR-FSH-04' },
  { name: 'فستان بناتي صيفي منفوش قطن', barcode: '6225503300052', category: 'ملابس أطفال', unit: 'قطعة', color: 'فوشيا', size: '6', price: 220.0, cost: 135.0, stock: 12, minStock: 2, sku: 'GDR-FSH-06' },
  { name: 'فستان بناتي صيفي منفوش قطن', barcode: '6225503300053', category: 'ملابس أطفال', unit: 'قطعة', color: 'أبيض', size: '6', price: 220.0, cost: 135.0, stock: 10, minStock: 2, sku: 'GDR-WHT-06' },
  { name: 'بيجامة أطفال قطن نوم مريحة', barcode: '6225503300061', category: 'ملابس أطفال', unit: 'قطعة', color: 'سماوي', size: '6', price: 160.0, cost: 98.0, stock: 14, minStock: 3, sku: 'KPJ-SKY-06' },
  { name: 'بيجامة أطفال قطن نوم مريحة', barcode: '6225503300062', category: 'ملابس أطفال', unit: 'قطعة', color: 'سماوي', size: '8', price: 160.0, cost: 98.0, stock: 14, minStock: 3, sku: 'KPJ-SKY-08' },
  { name: 'طقم سالوبيت أطفال بيبي قطن ناعم', barcode: '6225503300071', category: 'ملابس أطفال', unit: 'قطعة', color: 'لبني', size: '0-3 شهور', price: 130.0, cost: 80.0, stock: 15, minStock: 3, sku: 'BSL-LBN-03' },
  { name: 'طقم سالوبيت أطفال بيبي قطن ناعم', barcode: '6225503300072', category: 'ملابس أطفال', unit: 'قطعة', color: 'بيج', size: '3-6 شهور', price: 130.0, cost: 80.0, stock: 15, minStock: 3, sku: 'BSL-BEI-36' },

  // أحذية وحقائب
  { name: 'حذاء رياضي كوتشي كاجوال إير خفيف مريح', barcode: '6225504400011', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '41', price: 320.0, cost: 200.0, stock: 8, minStock: 2, sku: 'SHS-BLK-41' },
  { name: 'حذاء رياضي كوتشي كاجوال إير خفيف مريح', barcode: '6225504400012', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '42', price: 320.0, cost: 200.0, stock: 12, minStock: 3, sku: 'SHS-BLK-42' },
  { name: 'حذاء رياضي كوتشي كاجوال إير خفيف مريح', barcode: '6225504400013', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '43', price: 320.0, cost: 200.0, stock: 14, minStock: 3, sku: 'SHS-BLK-43' },
  { name: 'حذاء رياضي كوتشي كاجوال إير خفيف مريح', barcode: '6225504400014', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '44', price: 320.0, cost: 200.0, stock: 10, minStock: 2, sku: 'SHS-BLK-44' },
  { name: 'حذاء رياضي كوتشي كاجوال إير خفيف مريح', barcode: '6225504400015', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أبيض', size: '42', price: 320.0, cost: 200.0, stock: 12, minStock: 3, sku: 'SHS-WHT-42' },
  { name: 'حذاء رياضي كوتشي كاجوال إير خفيف مريح', barcode: '6225504400016', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أبيض', size: '43', price: 320.0, cost: 200.0, stock: 12, minStock: 3, sku: 'SHS-WHT-43' },
  { name: 'حذاء رياضي كوتشي كاجوال إير خفيف مريح', barcode: '6225504400017', category: 'أحذية وحقائب', unit: 'قطعة', color: 'رمادي', size: '43', price: 320.0, cost: 200.0, stock: 10, minStock: 2, sku: 'SHS-GRY-43' },
  { name: 'حذاء كلاسيك جلد طبيعي رجالي أسود فاخر', barcode: '6225504400021', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '41', price: 450.0, cost: 290.0, stock: 6, minStock: 1, sku: 'SHC-BLK-41' },
  { name: 'حذاء كلاسيك جلد طبيعي رجالي أسود فاخر', barcode: '6225504400022', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '42', price: 450.0, cost: 290.0, stock: 10, minStock: 2, sku: 'SHC-BLK-42' },
  { name: 'حذاء كلاسيك جلد طبيعي رجالي أسود فاخر', barcode: '6225504400023', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '43', price: 450.0, cost: 290.0, stock: 10, minStock: 2, sku: 'SHC-BLK-43' },
  { name: 'حذاء كلاسيك جلد طبيعي رجالي أسود فاخر', barcode: '6225504400024', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '44', price: 450.0, cost: 290.0, stock: 8, minStock: 2, sku: 'SHC-BLK-44' },
  { name: 'حذاء كلاسيك جلد طبيعي رجالي أسود فاخر', barcode: '6225504400025', category: 'أحذية وحقائب', unit: 'قطعة', color: 'بني', size: '42', price: 450.0, cost: 290.0, stock: 8, minStock: 2, sku: 'SHC-BRN-42' },
  { name: 'حذاء كلاسيك جلد طبيعي رجالي أسود فاخر', barcode: '6225504400026', category: 'أحذية وحقائب', unit: 'قطعة', color: 'بني', size: '43', price: 450.0, cost: 290.0, stock: 8, minStock: 2, sku: 'SHC-BRN-43' },
  { name: 'شبشب سلايدر مريح خروج/منزل طبي', barcode: '6225504400031', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '42', price: 95.0, cost: 50.0, stock: 15, minStock: 3, sku: 'SLD-BLK-42' },
  { name: 'شبشب سلايدر مريح خروج/منزل طبي', barcode: '6225504400032', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '43', price: 95.0, cost: 50.0, stock: 18, minStock: 3, sku: 'SLD-BLK-43' },
  { name: 'شبشب سلايدر مريح خروج/منزل طبي', barcode: '6225504400033', category: 'أحذية وحقائب', unit: 'قطعة', color: 'كحلي', size: '43', price: 95.0, cost: 50.0, stock: 15, minStock: 3, sku: 'SLD-NVY-43' },
  { name: 'شوز حريمي فلات مريح خروج', barcode: '6225504400071', category: 'أحذية وحقائب', unit: 'قطعة', color: 'بيج', size: '37', price: 220.0, cost: 135.0, stock: 8, minStock: 2, sku: 'FLT-BEI-37' },
  { name: 'شوز حريمي فلات مريح خروج', barcode: '6225504400072', category: 'أحذية وحقائب', unit: 'قطعة', color: 'بيج', size: '38', price: 220.0, cost: 135.0, stock: 12, minStock: 2, sku: 'FLT-BEI-38' },
  { name: 'شوز حريمي فلات مريح خروج', barcode: '6225504400073', category: 'أحذية وحقائب', unit: 'قطعة', color: 'بيج', size: '39', price: 220.0, cost: 135.0, stock: 10, minStock: 2, sku: 'FLT-BEI-39' },
  { name: 'شوز حريمي فلات مريح خروج', barcode: '6225504400074', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '38', price: 220.0, cost: 135.0, stock: 12, minStock: 2, sku: 'FLT-BLK-38' },
  { name: 'شوز حريمي فلات مريح خروج', barcode: '6225504400075', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: '39', price: 220.0, cost: 135.0, stock: 10, minStock: 2, sku: 'FLT-BLK-39' },
  { name: 'شنطة يد حريمي كروس جلد راقية ماركة', barcode: '6225504400041', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: 'وسط', price: 280.0, cost: 175.0, stock: 8, minStock: 2, sku: 'BAG-BLK-MD' },
  { name: 'شنطة يد حريمي كروس جلد راقية ماركة', barcode: '6225504400042', category: 'أحذية وحقائب', unit: 'قطعة', color: 'هافان', size: 'وسط', price: 280.0, cost: 175.0, stock: 8, minStock: 2, sku: 'BAG-HVN-MD' },
  { name: 'حقيبة ظهر باك باك للجامعة ضد الماء', barcode: '6225504400051', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: 'كبير', price: 290.0, cost: 180.0, stock: 12, minStock: 2, sku: 'BPK-BLK-LG' },
  { name: 'حقيبة ظهر باك باك للجامعة ضد الماء', barcode: '6225504400052', category: 'أحذية وحقائب', unit: 'قطعة', color: 'رمادي', size: 'كبير', price: 290.0, cost: 180.0, stock: 10, minStock: 2, sku: 'BPK-GRY-LG' },
  { name: 'محفظة جيب جلد طبيعي رجالي الأصلية', barcode: '6225504400061', category: 'أحذية وحقائب', unit: 'قطعة', color: 'أسود', size: 'كلاسيك', price: 120.0, cost: 65.0, stock: 15, minStock: 3, sku: 'WLT-BLK-CL' },
  { name: 'محفظة جيب جلد طبيعي رجالي الأصلية', barcode: '6225504400062', category: 'أحذية وحقائب', unit: 'قطعة', color: 'بني', size: 'كلاسيك', price: 120.0, cost: 65.0, stock: 15, minStock: 3, sku: 'WLT-BRN-CL' },

  // إكسسوارات ملابس
  { name: 'حزام جلد طبيعي رجالي كلاسيك إبزيم معدني', barcode: '6225505500011', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'أسود', size: '115 سم', price: 85.0, cost: 45.0, stock: 15, minStock: 3, sku: 'BLT-BLK-115' },
  { name: 'حزام جلد طبيعي رجالي كلاسيك إبزيم معدني', barcode: '6225505500012', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'بني', size: '115 سم', price: 85.0, cost: 45.0, stock: 15, minStock: 3, sku: 'BLT-BRN-115' },
  { name: 'حزام كاجوال قماش مضفر رياضي مريح', barcode: '6225505500020', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'كحلي', size: 'فري سايز', price: 55.0, cost: 28.0, stock: 20, minStock: 4, sku: 'BLT-NVY-FS' },
  { name: 'طرحة شيفون سادة ناعمة ألوان متعددة', barcode: '6225505500031', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'كشمير', size: '70x180 سم', price: 65.0, cost: 35.0, stock: 25, minStock: 5, sku: 'TRH-CSH-STD' },
  { name: 'طرحة شيفون سادة ناعمة ألوان متعددة', barcode: '6225505500032', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'بيج', size: '70x180 سم', price: 65.0, cost: 35.0, stock: 25, minStock: 5, sku: 'TRH-BEI-STD' },
  { name: 'طرحة شيفون سادة ناعمة ألوان متعددة', barcode: '6225505500033', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'أسود', size: '70x180 سم', price: 65.0, cost: 35.0, stock: 30, minStock: 6, sku: 'TRH-BLK-STD' },
  { name: 'طرحة كريب كويتي مطاط مريحة ألوان ثابتة', barcode: '6225505500041', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'كحلي', size: '75x185 سم', price: 75.0, cost: 42.0, stock: 20, minStock: 4, sku: 'TRK-NVY-STD' },
  { name: 'طرحة كريب كويتي مطاط مريحة ألوان ثابتة', barcode: '6225505500042', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'زيتي', size: '75x185 سم', price: 75.0, cost: 42.0, stock: 20, minStock: 4, sku: 'TRK-OLV-STD' },
  { name: 'شال صوف كشمير شتوي حريمي دافئ', barcode: '6225505500051', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'نبيتي', size: 'كبير', price: 130.0, cost: 75.0, stock: 12, minStock: 2, sku: 'SHL-BUR-LG' },
  { name: 'شال صوف كشمير شتوي حريمي دافئ', barcode: '6225505500052', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'رمادي', size: 'كبير', price: 130.0, cost: 75.0, stock: 12, minStock: 2, sku: 'SHL-GRY-LG' },
  { name: 'شراب قطن مصري طقم 3 قطع كعب مبطن', barcode: '6225505500061', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'أسود', size: '41-45', price: 45.0, cost: 25.0, stock: 30, minStock: 6, sku: 'SCK-BLK-4145' },
  { name: 'شراب قطن مصري طقم 3 قطع كعب مبطن', barcode: '6225505500062', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'أبيض', size: '41-45', price: 45.0, cost: 25.0, stock: 30, minStock: 6, sku: 'SCK-WHT-4145' },
  { name: 'كيس ملابس هدايا سميك فاخر للمحل', barcode: '6225505500071', category: 'إكسسوارات ملابس', unit: 'قطعة', color: 'أبيض', size: 'كبير', price: 5.0, cost: 2.2, stock: 100, minStock: 20, sku: 'BAG-GFT-LG' }
];

// 3. الكتالوجات التكميلية (صيدليات، حدايد وبويات، مطاعم وكافيهات)
const pharmacyItems = [
  { name: 'بنادول إكسترا أحمر شريط 12 قرص', barcode: '6221100010015', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 42.0, cost: 34.0, stock: 50, minStock: 10, sku: 'PHR-0001' },
  { name: 'بنادول أزرق خافض حرارة شريط 12 قرص', barcode: '6221100010022', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 35.0, cost: 28.5, stock: 50, minStock: 10, sku: 'PHR-0002' },
  { name: 'كونجستال نزلات برد وإنفلونزا شريط 10 أقراص', barcode: '6221100010039', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 28.0, cost: 22.0, stock: 60, minStock: 12, sku: 'PHR-0003' },
  { name: 'سيتال خافض حرارة للأطفال شراب 120 مل', barcode: '6221100010046', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 18.0, cost: 14.5, stock: 40, minStock: 8, sku: 'PHR-0004' },
  { name: 'بروفين مسكن ومضاد للالتهاب 400 مجم شريط 10 أقراص', barcode: '6221100010053', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 26.0, cost: 21.0, stock: 50, minStock: 10, sku: 'PHR-0005' },
  { name: 'أنتينال كبسول مطهر معوي شريط 12 كبسولة', barcode: '6221100010060', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 32.0, cost: 26.0, stock: 60, minStock: 15, sku: 'PHR-0006' },
  { name: 'ستربسلز استحلاب لالتهاب الحلق عسل وليمون باكت', barcode: '6221100010077', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 95.0, cost: 78.0, stock: 30, minStock: 6, sku: 'PHR-0007' },
  { name: 'أوتريفين بخاخ أنف للبالغين 10 مل', barcode: '6221100010084', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 24.0, cost: 19.0, stock: 40, minStock: 8, sku: 'PHR-0008' },
  { name: 'فوار راني لعلاج الحموضة باكت 6 أكياس', barcode: '6221100010091', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 20.0, cost: 16.0, stock: 50, minStock: 10, sku: 'PHR-0009' },
  { name: 'فوار كول يورين مسالك بولية باكت 6 أكياس', barcode: '6221100010107', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 22.0, cost: 17.5, stock: 40, minStock: 8, sku: 'PHR-0010' },
  { name: 'ألفينترن أقراص مضاد للتورم والالتهاب شريط 10 أقراص', barcode: '6221100010114', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 30.0, cost: 24.5, stock: 50, minStock: 10, sku: 'PHR-0011' },
  { name: 'كتافلام 50 مجم مسكن سريع شريط 10 أقراص', barcode: '6221100010121', category: 'أدوية ومسكنات شائعة', unit: 'قطعة', price: 38.0, cost: 31.0, stock: 50, minStock: 10, sku: 'PHR-0012' },
  { name: 'كحول طبي معقم إيثيلي 70% بخاخ 120 مل', barcode: '6221100020014', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 25.0, cost: 16.0, stock: 60, minStock: 12, sku: 'PHR-0013' },
  { name: 'بيتادين مطهر جروح سائل 60 مل', barcode: '6221100020021', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 45.0, cost: 36.0, stock: 40, minStock: 8, sku: 'PHR-0014' },
  { name: 'قطن طبي ممتص فاخر معقم 100 جم', barcode: '6221100020038', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 22.0, cost: 15.0, stock: 50, minStock: 10, sku: 'PHR-0015' },
  { name: 'شاش طبي معقم باكت 5 قطع', barcode: '6221100020045', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 15.0, cost: 9.5, stock: 60, minStock: 15, sku: 'PHR-0016' },
  { name: 'بلاستر طبي لاصق جروح علبة 50 قطعة', barcode: '6221100020052', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 30.0, cost: 18.0, stock: 40, minStock: 8, sku: 'PHR-0017' },
  { name: 'رباط ضاغط طبي مرن مقاس 10 سم', barcode: '6221100020069', category: 'مستلزمات وإسعافات', unit: 'قطعة', size: '10 سم', price: 20.0, cost: 12.0, stock: 35, minStock: 7, sku: 'PHR-0018' },
  { name: 'ترمومتر رقمي ديجيتال لقياس الحرارة شاشة LCD', barcode: '6221100020076', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 75.0, cost: 48.0, stock: 20, minStock: 4, sku: 'PHR-0019' },
  { name: 'سرنجة طبية معقمة 3 سم سن دقيق كرتونة 100', barcode: '6221100020083', category: 'مستلزمات وإسعافات', unit: 'قطعة', size: '3 سم', price: 2.5, cost: 1.6, stock: 200, minStock: 40, sku: 'PHR-0020' },
  { name: 'سرنجة طبية معقمة 5 سم كرتونة 100', barcode: '6221100020090', category: 'مستلزمات وإسعافات', unit: 'قطعة', size: '5 سم', price: 3.0, cost: 1.9, stock: 200, minStock: 40, sku: 'PHR-0021' },
  { name: 'كمامة طبية 3 طبقات دعامة أنف باكت 50 قطعة', barcode: '6221100020106', category: 'مستلزمات وإسعافات', unit: 'قطعة', color: 'أزرق', price: 40.0, cost: 24.0, stock: 50, minStock: 10, sku: 'PHR-0022' },
  { name: 'حفاضات بامبرز مقاس 3 عبوة التوفير 58 حفاضة', barcode: '6221100030013', category: 'عناية بالأم والطفل', unit: 'قطعة', size: 'مقاس 3', price: 290.0, cost: 255.0, stock: 25, minStock: 5, sku: 'PHR-0023' },
  { name: 'حفاضات بامبرز مقاس 4 عبوة جامبو 64 حفاضة', barcode: '6221100030020', category: 'عناية بالأم والطفل', unit: 'قطعة', size: 'مقاس 4', price: 320.0, cost: 280.0, stock: 25, minStock: 5, sku: 'PHR-0024' },
  { name: 'حفاضات مولفيكس مقاس 3 عبوة 58 حفاضة', barcode: '6221100030037', category: 'عناية بالأم والطفل', unit: 'قطعة', size: 'مقاس 3', price: 260.0, cost: 228.0, stock: 25, minStock: 5, sku: 'PHR-0025' },
  { name: 'مناديل مبللة جونسون للأطفال بدون كحول 72 منديل', barcode: '6221100030044', category: 'عناية بالأم والطفل', unit: 'قطعة', price: 45.0, cost: 35.0, stock: 40, minStock: 8, sku: 'PHR-0026' },
  { name: 'شامبو جونسون للأطفال لا دموع بعد اليوم 300 مل', barcode: '6221100030051', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '300 مل', price: 65.0, cost: 52.0, stock: 30, minStock: 6, sku: 'PHR-0027' },
  { name: 'زيت جونسون للأطفال مرطب ناعم 200 مل', barcode: '6221100030068', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '200 مل', price: 60.0, cost: 48.0, stock: 30, minStock: 6, sku: 'PHR-0028' },
  { name: 'بودرة تلك جونسون للأطفال نقية 200 جم', barcode: '6221100030075', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '200 جم', price: 50.0, cost: 39.0, stock: 35, minStock: 7, sku: 'PHR-0029' },
  { name: 'كريم سودوكريم لعلاج تسلخات الحفاضات 125 جم', barcode: '6221100030082', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '125 جم', price: 185.0, cost: 152.0, stock: 20, minStock: 4, sku: 'PHR-0030' },
  { name: 'ببرونة أطفال شيكو زجاجية حلمة سيليكون 150 مل', barcode: '6221100030099', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '150 مل', price: 95.0, cost: 72.0, stock: 20, minStock: 4, sku: 'PHR-0031' },
  { name: 'غسول وجه غارنييه سكين أكتيف فيتامين سي 100 مل', barcode: '6221100040012', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '100 مل', price: 85.0, cost: 68.0, stock: 30, minStock: 6, sku: 'PHR-0032' },
  { name: 'ماء ميسيلار منظف ومزيل مكياج غارنييه 400 مل', barcode: '6221100040029', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '400 مل', price: 110.0, cost: 89.0, stock: 25, minStock: 5, sku: 'PHR-0033' },
  { name: 'كريم نيفيا سوفت مرطب منعش للجسم والوجه 200 مل', barcode: '6221100040036', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '200 مل', price: 75.0, cost: 58.0, stock: 35, minStock: 7, sku: 'PHR-0034' },
  { name: 'كريم نيفيا أزرق كلاسيك علبة معدنية 150 مل', barcode: '6221100040043', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '150 مل', price: 65.0, cost: 51.0, stock: 40, minStock: 8, sku: 'PHR-0035' },
  { name: 'صن بلوك واقي شمس بوباي جل SPF50+ 50 جم', barcode: '6221100040050', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '50 جم', price: 160.0, cost: 128.0, stock: 20, minStock: 4, sku: 'PHR-0036' },
  { name: 'سيروم شعر سيروبايب كيراتين مضاد للتساقط 100 مل', barcode: '6221100040067', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '100 مل', price: 195.0, cost: 155.0, stock: 15, minStock: 3, sku: 'PHR-0037' },
  { name: 'حمام كريم شعر فاتيكا بالثوم والنخاع 500 جم', barcode: '6221100040074', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '500 جم', price: 65.0, cost: 50.0, stock: 30, minStock: 6, sku: 'PHR-0038' },
  { name: 'مزيل عرق ريكسونا بخاخ رجالي 150 مل حماية 48 ساعة', barcode: '6221100040081', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '150 مل', price: 75.0, cost: 59.0, stock: 35, minStock: 7, sku: 'PHR-0039' },
  { name: 'مزيل عرق نيفيا رول أون حريمي 50 مل حماية جافة', barcode: '6221100040098', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '50 مل', price: 55.0, cost: 42.0, stock: 40, minStock: 8, sku: 'PHR-0040' },
  { name: 'معجون أسنان سنسوداين للأسنان الحساسة 75 مل', barcode: '6221100040104', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '75 مل', price: 65.0, cost: 52.0, stock: 35, minStock: 7, sku: 'PHR-0041' },
  { name: 'موس حلاقة جيليت بلو 3 شفرات متحركة كيس 4 قطع', barcode: '6221100040111', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', price: 55.0, cost: 42.0, stock: 40, minStock: 8, sku: 'PHR-0042' }
];

const hardwareToolsItems = [
  { name: 'شاكوش مخلب مقبض فايبر مانع للانزلاق 500 جم', barcode: '6228800010014', category: 'أدوات يدوية ومعدات', unit: 'قطعة', size: '500 جم', price: 120.0, cost: 85.0, stock: 25, minStock: 5, sku: 'HDW-0001' },
  { name: 'بنسة كهرباء يد معزولة 8 بوصة توتال', barcode: '6228800010021', category: 'أدوات يدوية ومعدات', unit: 'قطعة', size: '8 بوصة', price: 95.0, cost: 68.0, stock: 30, minStock: 6, sku: 'HDW-0002' },
  { name: 'مفتاح إنجليزي فرنساوي 10 بوصة متين', barcode: '6228800010038', category: 'أدوات يدوية ومعدات', unit: 'قطعة', size: '10 بوصة', price: 110.0, cost: 78.0, stock: 20, minStock: 4, sku: 'HDW-0003' },
  { name: 'طقم مفكات عادة وصليبة 6 قطع صلب كروم', barcode: '6228800010045', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 140.0, cost: 98.0, stock: 20, minStock: 4, sku: 'HDW-0004' },
  { name: 'متر قياس شريط صلب 5 متر أوتوماتيك توتال', barcode: '6228800010052', category: 'أدوات يدوية ومعدات', unit: 'قطعة', size: '5 متر', price: 65.0, cost: 45.0, stock: 40, minStock: 8, sku: 'HDW-0005' },
  { name: 'ميزان مياه ألومنيوم مغناطيسي 40 سم 3 عيون', barcode: '6228800010069', category: 'أدوات يدوية ومعدات', unit: 'قطعة', size: '40 سم', price: 85.0, cost: 58.0, stock: 20, minStock: 4, sku: 'HDW-0006' },
  { name: 'مشرط كاتر معدني شفرة عريضة 18 ملم مع غيار', barcode: '6228800010076', category: 'أدوات يدوية ومعدات', unit: 'قطعة', size: '18 ملم', price: 35.0, cost: 22.0, stock: 50, minStock: 10, sku: 'HDW-0007' },
  { name: 'مسدس شمع لاصق كهربائي 60 وات سريع التسخين', barcode: '6228800010083', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 90.0, cost: 62.0, stock: 25, minStock: 5, sku: 'HDW-0008' },
  { name: 'أصابع شمع سيليكون مسدس باكت 10 صوابع', barcode: '6228800010090', category: 'أدوات يدوية ومعدات', unit: 'قطعة', price: 30.0, cost: 18.0, stock: 60, minStock: 12, sku: 'HDW-0009' },
  { name: 'بستلة دهان بلاستيك داخلي GLC مط 3030 أبيض', barcode: '6228800020013', category: 'دهانات وبويات', unit: 'قطعة', color: 'أبيض', size: 'بستلة', price: 420.0, cost: 360.0, stock: 15, minStock: 3, sku: 'HDW-0010' },
  { name: 'بستلة دهان بلاستيك سايبس ناصع البياض مط', barcode: '6228800020020', category: 'دهانات وبويات', unit: 'قطعة', color: 'أبيض ناصع', size: 'بستلة', price: 450.0, cost: 385.0, stock: 15, minStock: 3, sku: 'HDW-0011' },
  { name: 'كيلو لاكيه لامع أبيض كابسي ممتاز', barcode: '6228800020037', category: 'دهانات وبويات', unit: 'قطعة', color: 'أبيض لامع', size: '1 كجم', price: 125.0, cost: 102.0, stock: 30, minStock: 6, sku: 'HDW-0012' },
  { name: 'سكينة معجون صلب مرنة يد خشب 4 بوصة', barcode: '6228800020044', category: 'دهانات وبويات', unit: 'قطعة', size: '4 بوصة', price: 25.0, cost: 16.0, stock: 50, minStock: 10, sku: 'HDW-0013' },
  { name: 'رول دهان وبوية فايبر كاملة 9 بوصة', barcode: '6228800020051', category: 'دهانات وبويات', unit: 'قطعة', size: '9 بوصة', price: 55.0, cost: 38.0, stock: 40, minStock: 8, sku: 'HDW-0014' },
  { name: 'فرشاة دهان شعر طبيعي 3 بوصة توتال', barcode: '6228800020068', category: 'دهانات وبويات', unit: 'قطعة', size: '3 بوصة', price: 30.0, cost: 19.0, stock: 45, minStock: 10, sku: 'HDW-0015' },
  { name: 'علبة معجون حوائط جاهز 1 كجم GLC', barcode: '6228800020075', category: 'دهانات وبويات', unit: 'قطعة', size: '1 كجم', price: 35.0, cost: 26.0, stock: 40, minStock: 8, sku: 'HDW-0016' },
  { name: 'رول شريط لاصق ورقي مسكنج تيب 2 بوصة للدهانات', barcode: '6228800020082', category: 'دهانات وبويات', unit: 'قطعة', size: '2 بوصة', price: 20.0, cost: 13.0, stock: 60, minStock: 15, sku: 'HDW-0017' },
  { name: 'سبراي رش ألوان دوكو ألوان متعددة علبة 400 مل', barcode: '6228800020099', category: 'دهانات وبويات', unit: 'قطعة', color: 'أسود', size: '400 مل', price: 45.0, cost: 32.0, stock: 50, minStock: 10, sku: 'HDW-0018' },
  { name: 'لمبة ليد فينوس 9 وات إضاءة بيضاء موفرة', barcode: '6228800030012', category: 'كهرباء وإضاءة', unit: 'قطعة', color: 'أبيض', size: '9 وات', price: 45.0, cost: 35.0, stock: 60, minStock: 15, sku: 'HDW-0019' },
  { name: 'لمبة ليد فينوس 12 وات إضاءة بيضاء كرتونة', barcode: '6228800030029', category: 'كهرباء وإضاءة', unit: 'قطعة', color: 'أبيض', size: '12 وات', price: 55.0, cost: 43.0, stock: 50, minStock: 12, sku: 'HDW-0020' },
  { name: 'لمبة ليد بلح فينوس دلاية 4 وات أصفر وورم', barcode: '6228800030036', category: 'كهرباء وإضاءة', unit: 'قطعة', color: 'أصفر وورم', size: '4 وات', price: 40.0, cost: 30.0, stock: 40, minStock: 8, sku: 'HDW-0021' },
  { name: 'شاسيه مفتاح بريزة كهرباء ساس SAS أبيض', barcode: '6228800030043', category: 'كهرباء وإضاءة', unit: 'قطعة', color: 'أبيض', price: 18.0, cost: 12.5, stock: 60, minStock: 12, sku: 'HDW-0022' },
  { name: 'لقمة بريزة فيشة كهرباء ثلاثية ساس أصلي', barcode: '6228800030050', category: 'كهرباء وإضاءة', unit: 'قطعة', color: 'أبيض', price: 22.0, cost: 16.0, stock: 70, minStock: 15, sku: 'HDW-0023' },
  { name: 'شريط لحام عازل كهرباء شيرتول أصلي 10 متر', barcode: '6228800030067', category: 'كهرباء وإضاءة', unit: 'قطعة', color: 'أسود', size: '10 متر', price: 12.0, cost: 7.5, stock: 100, minStock: 25, sku: 'HDW-0024' },
  { name: 'لفة سلك سويدي معتمد نحاس شعر 1.5 ملم 100 متر', barcode: '6228800030074', category: 'كهرباء وإضاءة', unit: 'قطعة', size: '1.5 ملم', price: 850.0, cost: 760.0, stock: 10, minStock: 2, sku: 'HDW-0025' },
  { name: 'مشترك كهرباء 4 عين مع سلك 3 متر بمفتاح أمان', barcode: '6228800030081', category: 'كهرباء وإضاءة', unit: 'قطعة', size: '3 متر', price: 110.0, cost: 78.0, stock: 25, minStock: 5, sku: 'HDW-0026' },
  { name: 'شريط تيفلون سباكة أصلي مانع للتسريب لفة', barcode: '6228800040011', category: 'سباكة وتثبيت', unit: 'قطعة', price: 8.0, cost: 4.5, stock: 100, minStock: 20, sku: 'HDW-0027' },
  { name: 'خرطوم سخان مرن إيطالي استانلس ستيل 50 سم', barcode: '6228800040028', category: 'سباكة وتثبيت', unit: 'قطعة', size: '50 سم', price: 65.0, cost: 46.0, stock: 35, minStock: 7, sku: 'HDW-0028' },
  { name: 'محبس زاوية نحاس ألماني كروم أصلي 1/2 بوصة', barcode: '6228800040035', category: 'سباكة وتثبيت', unit: 'قطعة', size: '1/2 بوصة', price: 85.0, cost: 62.0, stock: 30, minStock: 6, sku: 'HDW-0029' },
  { name: 'أنبوبة سيليكون شفاف تركي مضاد للفطريات 300 مل', barcode: '6228800040042', category: 'سباكة وتثبيت', unit: 'قطعة', color: 'شفاف', size: '300 مل', price: 75.0, cost: 52.0, stock: 40, minStock: 8, sku: 'HDW-0030' },
  { name: 'باكت فيشر بلاستيك مقاس 6 ملم مع مسامير صلب 50 حبة', barcode: '6228800040059', category: 'سباكة وتثبيت', unit: 'قطعة', size: '6 ملم', price: 25.0, cost: 14.0, stock: 60, minStock: 15, sku: 'HDW-0031' },
  { name: 'باكت مسامير سن صاج 3 سم أسود كرتونة 100 مسمار', barcode: '6228800040066', category: 'سباكة وتثبيت', unit: 'قطعة', size: '3 سم', price: 20.0, cost: 12.0, stock: 70, minStock: 15, sku: 'HDW-0032' }
];

const restaurantsCafeItems = [
  { name: 'برجر لحم بقري كلاسيك سنجل مع جبنة شيدر', barcode: '5001', category: 'ساندوتشات وبرجر', unit: 'قطعة', size: 'سنجل', price: 85.0, cost: 55.0, stock: 100, minStock: 20, sku: 'RST-0001' },
  { name: 'برجر لحم بقري دبل مع صوص باربكيو مدخن', barcode: '5002', category: 'ساندوتشات وبرجر', unit: 'قطعة', size: 'دبل', price: 125.0, cost: 82.0, stock: 80, minStock: 15, sku: 'RST-0002' },
  { name: 'ساندوتش تشيكن كريسبي زنجر حار صوص مايونيز', barcode: '5003', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 95.0, cost: 62.0, stock: 90, minStock: 18, sku: 'RST-0003' },
  { name: 'ساندوتش فاهيتا دجاج مكسيكي بالمشروم والفلفل', barcode: '5004', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 90.0, cost: 58.0, stock: 70, minStock: 15, sku: 'RST-0004' },
  { name: 'ساندوتش شاورما لحم عربي صوص طحينة', barcode: '5005', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 75.0, cost: 48.0, stock: 100, minStock: 20, sku: 'RST-0005' },
  { name: 'ساندوتش شاورما فراخ سوري تومية وخيار مخلل', barcode: '5006', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 65.0, cost: 42.0, stock: 120, minStock: 25, sku: 'RST-0006' },
  { name: 'ساندوتش كفتة مشوية بلدي طحينة وسلطة خضراء', barcode: '5007', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 70.0, cost: 45.0, stock: 80, minStock: 15, sku: 'RST-0007' },
  { name: 'ساندوتش حواوشي بلدي مخصوص على الفحم', barcode: '5008', category: 'ساندوتشات وبرجر', unit: 'قطعة', price: 55.0, cost: 35.0, stock: 90, minStock: 20, sku: 'RST-0008' },
  { name: 'بيتزا مارجريتا إيطالي ريحان وجبنة وسط', barcode: '5010', category: 'بيتزا ومكرونات', unit: 'قطعة', size: 'وسط', price: 110.0, cost: 68.0, stock: 50, minStock: 10, sku: 'RST-0009' },
  { name: 'بيتزا سوبر سوبريم ميكس لحوم كبير', barcode: '5011', category: 'بيتزا ومكرونات', unit: 'قطعة', size: 'كبير', price: 175.0, cost: 110.0, stock: 40, minStock: 8, sku: 'RST-0010' },
  { name: 'بيتزا تشيكن رانش مع صوص الرانش وسط', barcode: '5012', category: 'بيتزا ومكرونات', unit: 'قطعة', size: 'وسط', price: 140.0, cost: 88.0, stock: 45, minStock: 10, sku: 'RST-0011' },
  { name: 'مكرونة نجرسكو دجاج صوص أبيض موتزاريلا', barcode: '5013', category: 'بيتزا ومكرونات', unit: 'قطعة', price: 95.0, cost: 60.0, stock: 50, minStock: 10, sku: 'RST-0012' },
  { name: 'مكرونة بشاميل باللحم المفروم طاجن', barcode: '5014', category: 'بيتزا ومكرونات', unit: 'قطعة', price: 85.0, cost: 52.0, stock: 50, minStock: 10, sku: 'RST-0013' },
  { name: 'بطاطس مقلية فارم فريتس مقرمشة وسط', barcode: '5020', category: 'مقبلات وجوانب', unit: 'قطعة', size: 'وسط', price: 30.0, cost: 16.0, stock: 150, minStock: 30, sku: 'RST-0014' },
  { name: 'بطاطس ودجز بالبهارات والأعشاب', barcode: '5021', category: 'مقبلات وجوانب', unit: 'قطعة', price: 40.0, cost: 22.0, stock: 80, minStock: 15, sku: 'RST-0015' },
  { name: 'أصابع جبنة موتزاريلا مقلية (4 قطع)', barcode: '5022', category: 'مقبلات وجوانب', unit: 'قطعة', price: 50.0, cost: 30.0, stock: 70, minStock: 15, sku: 'RST-0016' },
  { name: 'حلقات بصل مقرمشة مع صوص حار (6 قطع)', barcode: '5023', category: 'مقبلات وجوانب', unit: 'قطعة', price: 35.0, cost: 18.0, stock: 60, minStock: 12, sku: 'RST-0017' },
  { name: 'علبة صوص تومية سوري ممتازة', barcode: '5024', category: 'مقبلات وجوانب', unit: 'قطعة', price: 15.0, cost: 7.0, stock: 100, minStock: 20, sku: 'RST-0018' },
  { name: 'علبة صوص جبنة شيدر سائلة دافئة', barcode: '5025', category: 'مقبلات وجوانب', unit: 'قطعة', price: 20.0, cost: 10.0, stock: 90, minStock: 20, sku: 'RST-0019' },
  { name: 'إسبريسو سنجل شوت إيطالي فاخر', barcode: '5030', category: 'مشروبات ساخنة', unit: 'قطعة', size: 'سنجل', price: 35.0, cost: 12.0, stock: 200, minStock: 30, sku: 'RST-0020' },
  { name: 'إسبريسو دبل شوت إيطالي قوي', barcode: '5031', category: 'مشروبات ساخنة', unit: 'قطعة', size: 'دبل', price: 50.0, cost: 18.0, stock: 200, minStock: 30, sku: 'RST-0021' },
  { name: 'كابتشينو حليب مبخر رغوة غنية', barcode: '5032', category: 'مشروبات ساخنة', unit: 'قطعة', price: 55.0, cost: 24.0, stock: 150, minStock: 25, sku: 'RST-0022' },
  { name: 'كافيه لاتيه حليب دافئ كريمي', barcode: '5033', category: 'مشروبات ساخنة', unit: 'قطعة', price: 55.0, cost: 24.0, stock: 150, minStock: 25, sku: 'RST-0023' },
  { name: 'قهوة تركي بن محوج فنجان مظبوط', barcode: '5034', category: 'مشروبات ساخنة', unit: 'قطعة', price: 30.0, cost: 10.0, stock: 250, minStock: 40, sku: 'RST-0024' },
  { name: 'شاي أحمر إبريق صغير بالنعناع الطازج', barcode: '5035', category: 'مشروبات ساخنة', unit: 'قطعة', price: 20.0, cost: 5.0, stock: 300, minStock: 50, sku: 'RST-0025' },
  { name: 'هوت تشوكليت شوكولاتة بلجيكية فاخرة بالمارشميلو', barcode: '5036', category: 'مشروبات ساخنة', unit: 'قطعة', price: 60.0, cost: 28.0, stock: 100, minStock: 20, sku: 'RST-0026' },
  { name: 'آيس لاتيه كراميل مثلج', barcode: '5040', category: 'مشروبات باردة', unit: 'قطعة', price: 65.0, cost: 28.0, stock: 120, minStock: 20, sku: 'RST-0027' },
  { name: 'آيس سبانش لاتيه حليب مكثف', barcode: '5041', category: 'مشروبات باردة', unit: 'قطعة', price: 75.0, cost: 32.0, stock: 100, minStock: 20, sku: 'RST-0028' },
  { name: 'موهيتو ليمون ونعناع صودا منعشة', barcode: '5042', category: 'مشروبات باردة', unit: 'قطعة', price: 45.0, cost: 16.0, stock: 150, minStock: 25, sku: 'RST-0029' },
  { name: 'موهيتو فراولة وبلو بيري', barcode: '5043', category: 'مشروبات باردة', unit: 'قطعة', price: 50.0, cost: 18.0, stock: 120, minStock: 20, sku: 'RST-0030' },
  { name: 'عصير مانجو طبيعي طازج بدون ماء إضافي', barcode: '5044', category: 'مشروبات باردة', unit: 'قطعة', price: 45.0, cost: 20.0, stock: 100, minStock: 20, sku: 'RST-0031' },
  { name: 'عصير برتقال فريش طبيعي 100%', barcode: '5045', category: 'مشروبات باردة', unit: 'قطعة', price: 40.0, cost: 16.0, stock: 100, minStock: 20, sku: 'RST-0032' },
  { name: 'كانز مياه غازية 330 مل باردة', barcode: '5046', category: 'مشروبات باردة', unit: 'قطعة', size: '330 مل', price: 20.0, cost: 12.0, stock: 150, minStock: 30, sku: 'RST-0033' },
  { name: 'زجاجة مياه معدنية 600 مل', barcode: '5047', category: 'مشروبات باردة', unit: 'قطعة', size: '600 مل', price: 10.0, cost: 4.5, stock: 200, minStock: 40, sku: 'RST-0034' }
];

// دالة كتابة ملف إكسل منسق باحترافية كاملة مطابق 100% للنموذج الرسمي للتطبيق (14 عمود)
function exportExcelFile(fileName, sheetTitle, items) {
  const titleRow = ['رفيق POS - نموذج استيراد الأصناف المعتمد للمتاجر'];
  const instructionsRow = [
    'تعليمات هامة: الأعمدة المميزة بنجمة (*) إلزامية | الباركودات تحفظ كنص | اللون والمقاس اختياريان لمحلات الملابس والأحذية | الوحدة: قطعة أو كجم | المبالغ بالجنيه المصري'
  ];
  const headers = [
    'اسم الصنف *',
    'الباركود الرئيسي',
    'باركودات إضافية (مفصولة بفاصلة)',
    'القسم / التصنيف',
    'الوحدة (قطعة / كجم)',
    'اللون (اختياري / للملابس)',
    'المقاس (اختياري / للملابس)',
    'سعر البيع (بالجنيه) *',
    'سعر التكلفة (بالجنيه)',
    'الرصيد الافتتاحي',
    'حد الطلب الأدنى',
    'نسبة الضريبة (%)',
    'كود الصنف الداخلي (SKU)',
    'كود التصنيف الضريبي (GS1/EGS)'
  ];

  const dataRows = items.map((item, idx) => [
    item.name || '',
    item.barcode ? String(item.barcode) : '',
    item.additionalBarcodes ? String(item.additionalBarcodes) : '',
    item.category || 'عام',
    item.unit || 'قطعة',
    item.color || item.variantColor || '',
    item.size || item.variantSize || '',
    Number(item.price || 0),
    Number(item.cost || 0),
    Number(item.stock || 0),
    Number(item.minStock || 0),
    Number(item.taxRate || 0),
    item.sku || item.internalCode || `SKU-${String(idx + 1).padStart(4, '0')}`,
    item.taxCategoryCode || ''
  ]);

  const allRows = [titleRow, instructionsRow, headers, ...dataRows];
  const ws = xlsx.utils.aoa_to_sheet(allRows);

  // دمج خلايا العنوان والتعليمات
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } }
  ];

  // أبعاد الأعمدة المتناسقة
  ws['!cols'] = [
    { wch: 42 }, // اسم الصنف *
    { wch: 20 }, // الباركود الرئيسي
    { wch: 22 }, // باركودات إضافية
    { wch: 22 }, // القسم / التصنيف
    { wch: 14 }, // الوحدة
    { wch: 18 }, // اللون
    { wch: 18 }, // المقاس
    { wch: 16 }, // سعر البيع
    { wch: 16 }, // سعر التكلفة
    { wch: 16 }, // الرصيد الافتتاحي
    { wch: 16 }, // حد الطلب الأدنى
    { wch: 14 }, // نسبة الضريبة
    { wch: 20 }, // كود الصنف الداخلي
    { wch: 22 }  // كود التصنيف الضريبي
  ];

  // تفعيل الاتجاه العربي الأصيل (RTL)
  ws['!views'] = [{ rightToLeft: true }];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetTitle);

  const fullPath = path.join(OUTPUT_DIR, fileName);
  xlsx.writeFile(wb, fullPath, { bookType: 'xlsx', compression: true });
  console.log(`[تم التصدير بنجاح] ${fileName} (${items.length} صنف ومتغير)`);
}

// تشغيل التوليد لكافة الكتالوجات الـ 12
console.log('--- بدء توليد ملفات الإكسل الرسمية المطابقة لنموذج التطبيق المعتمد ---');

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

console.log('--- تم الانتهاء بنجاح من توليد كافة ملفات الإكسل بنسبة 100% ---');
