const fs = require('fs');
const path = require('path');
const xlsx = require(path.resolve(__dirname, '..', 'frontend', 'node_modules', 'xlsx'));

const OUTPUT_DIR = path.resolve(__dirname, '..', 'قوالب_أصناف_المحلات_Excel');

// 1. Read drug catalog (237 drugs)
const drugPath = path.resolve(__dirname, '..', 'دليل_الأدوية_المصرية_الشامل.xlsx');
const drugWb = xlsx.readFile(drugPath);
const drugRows = xlsx.utils.sheet_to_json(drugWb.Sheets[drugWb.SheetNames[0]], { header: 1 });
const drugs = drugRows.slice(3).map(r => ({
  barcode: String(r[0] || ''),
  tradeName: String(r[1] || ''),
  scientificName: String(r[2] || ''),
  form: String(r[3] || ''),
  strength: String(r[4] || ''),
  manufacturer: String(r[5] || ''),
  packDesc: String(r[6] || ''),
  price: Number(r[7] || 0),
  notes: String(r[8] || '')
}));

function getPharmaCategory(d) {
  const t = (d.tradeName + ' ' + d.scientificName + ' ' + d.notes).toLowerCase();
  
  if (t.includes('أنسولين') || t.includes('سكر') || t.includes('ضغط') || t.includes('قلب') || t.includes('كوليسترول') || t.includes('تجلط') || t.includes('سيولة') || t.includes('غدة') || t.includes('كونكور') || t.includes('جلوكوفاج') || t.includes('أماريل') || t.includes('إكسفورج') || t.includes('بلافيكس') || t.includes('ماريفان') || t.includes('أسبوسيد') || t.includes('إلتروكسين') || t.includes('أتور') || t.includes('كريستور') || t.includes('كابوتين') || t.includes('نوفورابيد') || t.includes('لانتوس') || t.includes('جانوفيا') || t.includes('جالفوس') || t.includes('فيلداجليبتين') || t.includes('ديباكين') || t.includes('كاربيمازول')) {
    return 'أدوية الأمراض المزمنة والضغط والسكر';
  }
  
  if (t.includes('أوجمنتين') || t.includes('مضاد حيوي') || t.includes('هاي بيوتك') || t.includes('كلافيموكس') || t.includes('يوناسين') || t.includes('سفترياكسون') || t.includes('زيثروماكس') || t.includes('سبروفلوكساسين') || t.includes('فلاجيل') || t.includes('تارانيفيد') || t.includes('كيورام') || t.includes('سيبرازول') || t.includes('يونيكتام') || t.includes('ميجاموكس') || t.includes('أموكسيسيلين') || t.includes('ليفوفلوكساسين') || t.includes('كليندامايسين') || t.includes('دلاسين') || t.includes('أزيثرومايسين') || t.includes('سيفوتاكس') || t.includes('سيبروسين')) {
    return 'مضادات حيوية ومطهرات بكتيرية';
  }

  if (t.includes('معدة') || t.includes('حموضة') || t.includes('قولون') || t.includes('إسهال') || t.includes('إمساك') || t.includes('قيء') || t.includes('أوميبرازول') || t.includes('كونترولوك') || t.includes('نيكسيوم') || t.includes('أنتينال') || t.includes('ديجستين') || t.includes('سبازموفري') || t.includes('كولونا') || t.includes('موتيليوم') || t.includes('فوار راني') || t.includes('فوار كول يورين') || t.includes('انتينال') || t.includes('ميبافيوران') || t.includes('ستروبتوكين') || t.includes('أورغانو') || t.includes('لاكتيلوز') || t.includes('دوفلاك') || t.includes('بيساديل') || t.includes('ميكوجيل') || t.includes('إبيكوجيل') || t.includes('مالوكس') || t.includes('جافيسكون') || t.includes('فلاجيل')) {
    return 'أدوية الجهاز الهضمي والمعدة والكبد';
  }

  if (t.includes('أطفال') || t.includes('رضع') || t.includes('سيتال شراب') || t.includes('ديكال') || t.includes('فيتامين د') || t.includes('بيبي درينك') || t.includes('دينتينوكس') || t.includes('بروفين شراب') || t.includes('كونجستال شراب') || t.includes('أوجمنتين شراب') || t.includes('أنتينال شراب') || t.includes('في دروب') || t.includes('أدول شراب') || t.includes('ماكسيلاز') || t.includes('ميبريكس') || t.includes('سيتال نقط') || t.includes('بيبي فيت')) {
    return 'أدوية الأطفال والرضع';
  }

  return 'أدوية ومسكنات شائعة وفيتامينات';
}

let skuCounter = 1;
const convertedDrugItems = drugs.map(d => {
  const cat = getPharmaCategory(d);
  const price = d.price;
  const cost = Number((price * 0.78).toFixed(2));
  return {
    name: d.tradeName + (d.strength ? ' ' + d.strength : '') + (d.packDesc ? ' (' + d.packDesc + ')' : ''),
    barcode: d.barcode,
    additionalBarcodes: '',
    category: cat,
    unit: 'قطعة',
    color: '',
    size: d.strength || '',
    price: price,
    cost: cost,
    stock: 25,
    minStock: 5,
    taxRate: 0,
    sku: 'MED-' + String(skuCounter++).padStart(4, '0'),
    taxCategoryCode: ''
  };
});

// 2. Read template 09
const template09Path = path.join(OUTPUT_DIR, '09_صيدليات_ومستحضرات_تجميل_وعناية.xlsx');
const templWb = xlsx.readFile(template09Path);
const otherItems = [];

['مستلزمات وإسعافات', 'عناية بالأم والطفل', 'تجميل وعناية بالبشرة'].forEach(sheetName => {
  const s = templWb.Sheets[sheetName];
  if (!s) return;
  const rows = xlsx.utils.sheet_to_json(s, { header: 1 });
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1] || typeof r[0] !== 'number') continue;
    otherItems.push({
      name: String(r[1] || ''),
      barcode: String(r[2] || ''),
      additionalBarcodes: String(r[3] || ''),
      category: sheetName,
      unit: String(r[4] || 'قطعة'),
      color: String(r[17] || ''),
      size: String(r[18] || ''),
      price: Number(r[5] || 0),
      cost: Number(r[6] || 0),
      stock: Number(r[7] || 0),
      minStock: Number(r[8] || 0),
      taxRate: Number(r[15] || 0),
      sku: String(r[16] || ('PHR-' + String(skuCounter++).padStart(4, '0'))),
      taxCategoryCode: String(r[19] || '')
    });
  }
});

// Additional top-selling cosmetics and personal care products for modern pharmacies
const additionalCosmetics = [
  // مستحضرات تجميل وعناية بالبشرة
  { name: 'غسول لاروش بوزيه إيفاكلار جل للبشرة الدهنية 200 مل', barcode: '3337872411083', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '200 مل', price: 420.0, cost: 335.0, stock: 15, minStock: 3, sku: 'COS-0001' },
  { name: 'واقي شمس لاروش بوزيه أنثيليوس سائل SPF50+ 50 مل', barcode: '3337875591058', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '50 مل', price: 580.0, cost: 460.0, stock: 12, minStock: 2, sku: 'COS-0002' },
  { name: 'سيروم فيشي مينيرال 89 لترطيب البشرة بحمض الهيالورونيك 50 مل', barcode: '3337875543248', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '50 مل', price: 620.0, cost: 495.0, stock: 10, minStock: 2, sku: 'COS-0003' },
  { name: 'كريم سيرافي المرطب للبشرة الجافة إلى شديدة الجفاف 177 مل', barcode: '3337875597227', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '177 مل', price: 340.0, cost: 270.0, stock: 20, minStock: 4, sku: 'COS-0004' },
  { name: 'غسول سيرافي الرغوي للبشرة العادية إلى الدهنية 236 مل', barcode: '3337875597180', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '236 مل', price: 360.0, cost: 285.0, stock: 18, minStock: 3, sku: 'COS-0005' },
  { name: 'بيوديرما سيبيوم جل غسول منقي للبشرة المختلطة 200 مل', barcode: '3401578653709', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '200 مل', price: 390.0, cost: 310.0, stock: 15, minStock: 3, sku: 'COS-0006' },
  { name: 'ماء ميسيلار بيوديرما سينسيبيو الوردي للبشرة الحساسة 500 مل', barcode: '3401570498708', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '500 مل', price: 410.0, cost: 325.0, stock: 15, minStock: 3, sku: 'COS-0007' },
  { name: 'كريم إيفا بي-وايت لتفتيح الهالات السوداء 20 مل', barcode: '6221100040128', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '20 مل', price: 65.0, cost: 48.0, stock: 30, minStock: 6, sku: 'COS-0008' },
  { name: 'كريم إيفا كولاجين لمكافحة التجاعيد ونضارة الوجه 50 مل', barcode: '6221100040135', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '50 مل', price: 140.0, cost: 105.0, stock: 25, minStock: 5, sku: 'COS-0009' },
  { name: 'مرطب شفاه لابيلو كرز لمعان ولون ناعم 4.8 جم', barcode: '4005808369904', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', color: 'كرز', price: 55.0, cost: 40.0, stock: 40, minStock: 8, sku: 'COS-0010' },
  { name: 'كريم بانثينول مرطب وملطف طبي للجلد 50 جم', barcode: '6221100040142', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '50 جم', price: 30.0, cost: 22.0, stock: 60, minStock: 15, sku: 'COS-0011' },
  { name: 'زيت شعر دابر أملا الذهبي المغذي 200 مل', barcode: '6221100040159', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '200 مل', price: 60.0, cost: 45.0, stock: 30, minStock: 6, sku: 'COS-0012' },
  { name: 'شامبو لوريال إلفيف للشعر الجاف والتالف بالزيوت الثمينة 400 مل', barcode: '3600522851508', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '400 مل', price: 120.0, cost: 95.0, stock: 25, minStock: 5, sku: 'COS-0013' },
  { name: 'بديل الزيت بانتين برو-في للشعر المصبوغ 350 مل', barcode: '8001090123456', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '350 مل', price: 95.0, cost: 75.0, stock: 25, minStock: 5, sku: 'COS-0014' },
  { name: 'شامبو نيزابكس مضاد للقشرة والفطريات 80 مل', barcode: '6221100040166', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '80 مل', price: 45.0, cost: 35.0, stock: 35, minStock: 7, sku: 'COS-0015' },
  { name: 'شامبو كيتوديرم مضاد للقشرة والحكة 100 مل', barcode: '6221100040173', category: 'تجميل وعناية بالبشرة', unit: 'قطعة', size: '100 مل', price: 50.0, cost: 38.0, stock: 30, minStock: 6, sku: 'COS-0016' },

  // عناية بالأم والطفل
  { name: 'حليب أطفال نان 1 أوبتي برو من الولادة حتى 6 أشهر 400 جم', barcode: '7613035345678', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '400 جم', price: 230.0, cost: 195.0, stock: 20, minStock: 4, sku: 'BABY-0001' },
  { name: 'حليب أطفال بيبيلاك 1 من الولادة حتى 6 أشهر 400 جم', barcode: '8712400123456', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '400 جم', price: 195.0, cost: 165.0, stock: 20, minStock: 4, sku: 'BABY-0002' },
  { name: 'سيريلاك أطفال قمح وحليب من عمر 6 أشهر 250 جم', barcode: '7613031234567', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '250 جم', price: 65.0, cost: 52.0, stock: 30, minStock: 6, sku: 'BABY-0003' },
  { name: 'لهاية أطفال سيليكون شيكو تقويمية 0-6 أشهر', barcode: '8058664012345', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '0-6 شهور', price: 85.0, cost: 65.0, stock: 25, minStock: 5, sku: 'BABY-0004' },
  { name: 'كريم سانوسان لمنطقة الحفاض للأطفال بزيت الزيتون 150 مل', barcode: '4006083012345', category: 'عناية بالأم والطفل', unit: 'قطعة', size: '150 مل', price: 160.0, cost: 125.0, stock: 20, minStock: 4, sku: 'BABY-0005' },

  // مستلزمات طبية وإسعافات
  { name: 'جهاز قياس السكر في الدم أكوا شيك إنستانت + 10 شرائط', barcode: '4015630012345', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 550.0, cost: 440.0, stock: 10, minStock: 2, sku: 'SUP-0001' },
  { name: 'شرائط قياس سكر أكوا شيك إنستانت علبة 50 شريط', barcode: '4015630012352', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 380.0, cost: 310.0, stock: 25, minStock: 5, sku: 'SUP-0002' },
  { name: 'جهاز قياس ضغط الدم ديجيتال أومرون M2 للذراع', barcode: '4015672101234', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 1650.0, cost: 1350.0, stock: 5, minStock: 1, sku: 'SUP-0003' },
  { name: 'جهاز استنشاق بخار ونيبولايزر للأطفال والكبار بروسوفت', barcode: '6221100020113', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 850.0, cost: 680.0, stock: 8, minStock: 2, sku: 'SUP-0004' },
  { name: 'محلول ملح فسيولوجي معقم للوريد 0.9% 500 مل', barcode: '6221100020120', category: 'مستلزمات وإسعافات', unit: 'قطعة', size: '500 مل', price: 20.0, cost: 14.0, stock: 50, minStock: 10, sku: 'SUP-0005' },
  { name: 'محلول جلوكوز 5% للوريد معقم 500 مل', barcode: '6221100020137', category: 'مستلزمات وإسعافات', unit: 'قطعة', size: '500 مل', price: 22.0, cost: 15.0, stock: 40, minStock: 10, sku: 'SUP-0006' },
  { name: 'كانيولا وريدية مقاس 22 زرقاء كرتونة 50 قطعة', barcode: '6221100020144', category: 'مستلزمات وإسعافات', unit: 'قطعة', size: 'مقاس 22', price: 8.0, cost: 5.0, stock: 100, minStock: 20, sku: 'SUP-0007' },
  { name: 'جهاز نقل محاليل وريدي معقم', barcode: '6221100020151', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 7.0, cost: 4.5, stock: 100, minStock: 20, sku: 'SUP-0008' },
  { name: 'قفازات طبية لاتكس معقمة علبة 100 قفاز مقاس وسط M', barcode: '6221100020168', category: 'مستلزمات وإسعافات', unit: 'قطعة', size: 'M', price: 160.0, cost: 120.0, stock: 30, minStock: 6, sku: 'SUP-0009' },
  { name: 'اختبار حمل منزلي سريع شريط كاشف دقيق بيبي تشيك', barcode: '6221100020175', category: 'مستلزمات وإسعافات', unit: 'قطعة', price: 25.0, cost: 14.0, stock: 60, minStock: 15, sku: 'SUP-0010' }
];

const allPharmaItems = [...convertedDrugItems, ...otherItems, ...additionalCosmetics];

function sanitizeSheetName(name, usedSet) {
  let clean = name.replace(/[\\/*?:[\]]/g, '').trim();
  if (!clean) clean = 'قسم_عام';
  if (clean.length > 31) clean = clean.substring(0, 31).trim();
  let finalName = clean;
  let counter = 2;
  while (usedSet.has(finalName)) {
    const suffix = '_' + counter;
    const base = clean.substring(0, 31 - suffix.length);
    finalName = base + suffix;
    counter++;
  }
  usedSet.add(finalName);
  return finalName;
}

function buildAndSavePharmaFile(fileName, items) {
  const wb = xlsx.utils.book_new();
  const usedSheetNames = new Set();
  const categoryGroups = new Map();

  items.forEach(item => {
    const cat = (item.category || 'عام').trim();
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
    categoryGroups.get(cat).push(item);
  });

  const categoriesList = Array.from(categoryGroups.keys());
  const categorySheetNames = new Map();
  categoriesList.forEach(cat => {
    categorySheetNames.set(cat, sanitizeSheetName(cat, usedSheetNames));
  });

  const standardHeaders = [
    'م',
    'اسم الصنف *',
    'الباركود الرئيسي',
    'باركودات إضافية (مفصولة بفاصلة)',
    'الوحدة (قطعة / كجم)',
    'سعر البيع (بالجنيه) *',
    'سعر التكلفة (بالجنيه)',
    'الرصيد الافتتاحي',
    'حد الطلب الأدنى',
    'هامش الربح للقطعة (ج.م)',
    'نسبة الربح (%)',
    'إجمالي قيمة التكلفة (ج.م)',
    'إجمالي القيمة البيعية (ج.م)',
    'إجمالي الربح المتوقع (ج.م)',
    'حالة المخزون التلقائية',
    'نسبة الضريبة (%)',
    'كود الصنف الداخلي (SKU)',
    'اللون (اختياري / للملابس)',
    'المقاس (اختياري / للملابس)',
    'كود التصنيف الضريبي (GS1/EGS)'
  ];

  const standardColWidths = [
    { wch: 6 },
    { wch: 44 },
    { wch: 20 },
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 25 }
  ];

  function buildProductSheet(sheetTitle, catItems) {
    const titleRow = ['رفيق POS - ' + sheetTitle];
    const instructionsRow = [
      'تعليمات هامة: الأعمدة المميزة بنجمة (*) إلزامية | اسم التابة يمثل القسم تلقائياً | المبالغ بالجنيه المصري | الأعمدة الملونة تحتوي على معادلات إكسل تتحدث تلقائياً'
    ];

    const dataRows = catItems.map((item, index) => {
      const rowNum = index + 4;
      const profitFormula = 'F' + rowNum + '-G' + rowNum;
      const marginFormula = 'IF(G' + rowNum + '>0, (F' + rowNum + '-G' + rowNum + ')/G' + rowNum + ', 0)';
      const totalCostFormula = 'H' + rowNum + '*G' + rowNum;
      const totalSaleFormula = 'H' + rowNum + '*F' + rowNum;
      const totalProfitFormula = 'M' + rowNum + '-L' + rowNum;
      const stockStatusFormula = 'IF(H' + rowNum + '<=0, "نفد من المخزن", IF(H' + rowNum + '<=I' + rowNum + ', "قارب على النفاد", "متوفر بالمخزن"))';

      return [
        index + 1,
        item.name || '',
        item.barcode || '',
        item.additionalBarcodes || '',
        item.unit || 'قطعة',
        item.price || 0,
        item.cost || 0,
        item.stock || 0,
        item.minStock || 0,
        { f: profitFormula, t: 'n', z: '#,##0.00' },
        { f: marginFormula, t: 'n', z: '0.00%' },
        { f: totalCostFormula, t: 'n', z: '#,##0.00' },
        { f: totalSaleFormula, t: 'n', z: '#,##0.00' },
        { f: totalProfitFormula, t: 'n', z: '#,##0.00' },
        { f: stockStatusFormula, t: 's' },
        item.taxRate || 0,
        item.sku || '',
        item.color || '',
        item.size || '',
        item.taxCategoryCode || ''
      ];
    });

    const lastDataRow = dataRows.length + 3;
    const summaryRow = [
      'الإجمالي',
      'عدد الأصناف: ' + catItems.length,
      '',
      '',
      '',
      { f: 'AVERAGE(F4:F' + lastDataRow + ')', t: 'n', z: '#,##0.00' },
      { f: 'AVERAGE(G4:G' + lastDataRow + ')', t: 'n', z: '#,##0.00' },
      { f: 'SUM(H4:H' + lastDataRow + ')', t: 'n', z: '#,##0' },
      { f: 'SUM(I4:I' + lastDataRow + ')', t: 'n', z: '#,##0' },
      { f: 'AVERAGE(J4:J' + lastDataRow + ')', t: 'n', z: '#,##0.00' },
      { f: 'AVERAGE(K4:K' + lastDataRow + ')', t: 'n', z: '0.00%' },
      { f: 'SUM(L4:L' + lastDataRow + ')', t: 'n', z: '#,##0.00' },
      { f: 'SUM(M4:M' + lastDataRow + ')', t: 'n', z: '#,##0.00' },
      { f: 'SUM(N4:N' + lastDataRow + ')', t: 'n', z: '#,##0.00' },
      'محسوب بمعادلات إكسل',
      '',
      '',
      '',
      '',
      ''
    ];

    const allSheetRows = [titleRow, instructionsRow, standardHeaders, ...dataRows, summaryRow];
    const ws = xlsx.utils.aoa_to_sheet(allSheetRows);

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 19 } }
    ];

    ws['!cols'] = standardColWidths;
    ws['!views'] = [{ rightToLeft: true }];
    return ws;
  }

  categoriesList.forEach(cat => {
    const catItems = categoryGroups.get(cat);
    const catSheetName = categorySheetNames.get(cat);
    const wsCategory = buildProductSheet('قائمة أصناف قسم: [' + cat + ']', catItems);
    xlsx.utils.book_append_sheet(wb, wsCategory, catSheetName);
  });

  const fullPath = path.join(OUTPUT_DIR, fileName);
  xlsx.writeFile(wb, fullPath, { bookType: 'xlsx', compression: true });
  console.log(`[Success] Written ${fileName} with ${items.length} items across ${categoriesList.length} sheets.`);
}

console.log('--- Generating updated 09 and 13 Excel templates ---');
// 1. Comprehensive pharmacy file with all 237 medicines + cosmetics + mother/baby + supplies (298 total items)
buildAndSavePharmaFile('09_صيدليات_ومستحضرات_تجميل_وعناية.xlsx', allPharmaItems);

// 2. Specialized Cosmetics & Personal Care file (57 top products)
const onlyCosmeticsItems = allPharmaItems.filter(i => 
  i.category === 'تجميل وعناية بالبشرة' || 
  i.category === 'عناية بالأم والطفل' ||
  i.category === 'مستلزمات وإسعافات'
);
buildAndSavePharmaFile('13_مستحضرات_تجميل_وعناية_بالبشرة.xlsx', onlyCosmeticsItems);
console.log('--- All Excel files updated successfully ---');
