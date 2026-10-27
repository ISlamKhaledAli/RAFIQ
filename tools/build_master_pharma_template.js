const fs = require('fs');
const path = require('path');
const xlsx = require(path.resolve(__dirname, '..', 'frontend', 'node_modules', 'xlsx'));

const OUTPUT_PATH = path.resolve(__dirname, '..', 'قوالب_أصناف_المحلات_Excel', '09_صيدليات_ومستحضرات_تجميل_وعناية.xlsx');
const BIG_DIRECTORY_PATH = path.resolve(__dirname, '..', 'frontend', 'public', 'دليل_الأدوية_المصرية_الشامل.xlsx');

console.time('Load Big Directory');
const bigWb = xlsx.readFile(BIG_DIRECTORY_PATH);
const bigSheet = bigWb.Sheets[bigWb.SheetNames[0]];
const bigData = xlsx.utils.sheet_to_json(bigSheet, { header: 1 });
console.timeEnd('Load Big Directory');

// Parse all 26k drugs into indexed records
const allDrugs = [];
for (let i = 3; i < bigData.length; i++) {
  const r = bigData[i];
  if (!r || !r[0] || !r[1]) continue;
  const barcode = String(r[0]).trim();
  const tradeName = String(r[1]).trim();
  const sciName = r[2] ? String(r[2]).trim() : '';
  const form = r[3] ? String(r[3]).trim() : '';
  const strength = r[4] ? String(r[4]).trim() : '';
  const flavor = r[5] ? String(r[5]).trim() : '';
  const manufacturer = r[6] ? String(r[6]).trim() : '';
  const therapeutic = r[7] ? String(r[7]).trim() : '';
  const category = r[8] ? String(r[8]).trim() : '';
  const storage = r[9] ? String(r[9]).trim() : '';
  const isRefrig = String(r[10] || '').includes('نعم') ? 'نعم' : 'لا';
  const route = r[11] ? String(r[11]).trim() : 'فموي (Oral)';
  const pregnancy = r[12] ? String(r[12]).trim() : 'فئة B (آمن نسبياً)';
  const isAntibiotic = String(r[13] || '').includes('نعم') ? 'نعم' : 'لا';
  const rxStatus = r[14] ? String(r[14]).trim() : 'صرف مباشر (OTC)';
  const packDesc = r[15] ? String(r[15]).trim() : '';
  const pieces = parseInt(r[16], 10) || (form.includes('أقراص') || form.includes('كبسول') ? 2 : 1);
  const price = parseFloat(r[17]) || 20;

  allDrugs.push({
    barcode,
    tradeName,
    sciName,
    form,
    strength,
    flavor,
    manufacturer,
    therapeutic,
    category,
    storage,
    isRefrig,
    route,
    pregnancy,
    isAntibiotic,
    rxStatus,
    packDesc,
    pieces,
    price
  });
}

console.log('Indexed', allDrugs.length, 'drugs from Egyptian directory.');

// Categories definition
const categories = [
  {
    name: 'أدوية ومسكنات شائعة وفيتامينات',
    keywords: [
      'panadol', 'بانادول', 'بنادول', 'cataflam', 'كتافلام', 'brufen', 'بروفين', 'voltaren', 'فولتارين',
      'cetal', 'سيتال', 'ketofan', 'كيتوفان', 'antiflam', 'انتيفلام', 'comtrex', 'كومتركس',
      'congestal', 'كونجستال', 'neurobion', 'نيوروبيون', 'sansovit', 'سانسوفيت', 'milga', 'ميلجا',
      'aspegic', 'اسبيجيك', 'aspirin', 'اسبرين', 'paramol', 'بارامول', 'alphintern', 'الفا انترن',
      'otrivin', 'اوتروفين', 'vitamount', 'فيتامونت', 'caltrate', 'كالترات', 'osteocare', 'اوستيوكير',
      'ferroglobin', 'فيروجلوبين', 'doliprane', 'دوليبران', 'adwiflam', 'ادويفلام', 'flamamol', 'فلامامول'
    ],
    maxItems: 60
  },
  {
    name: 'أدوية الأطفال والرضع',
    keywords: [
      'سيتال شراب', 'سيتال نقط', 'بروفين شراب', 'بيبي درينك', 'دينتينوكس', 'في دروب', 'vi-drop',
      'ماكسيلاز', 'maxilase', 'ميبريكس', 'بيبي فيت', 'كونجستال شراب', 'أوجمنتين شراب', 'انتينال شراب',
      'dentaspray', 'dentinox', 'baby drink', 'motinorm شراب', 'motilium شراب', 'ديسفلاتيل نقط',
      'زيرتك شراب', 'zyrtec syrup', 'كافسيد باراسيتامول لبوس', 'دولفين لبوس', 'سيتال لبوس',
      'بيبي رينو', 'أوتريفين بيبي سالين', 'physiomer', 'ستيريمار', 'sterimar', 'نان 1', 'نان 2',
      'سيميلاك', 'أبتاميل', 'هيرو بيبي', 'سيلياك', 'لاكتيلوز شراب', 'كالبول شراب'
    ],
    maxItems: 45
  },
  {
    name: 'أدوية الأمراض المزمنة والضغط والسكر',
    keywords: [
      'concor', 'كونكور', 'glucophage', 'جلوكوفاج', 'amaryl', 'أماريل', 'exforge', 'إكسفورج',
      'plavix', 'بلافيكس', 'marevan', 'ماريفان', 'capoten', 'كابوتين', 'eltroxin', 'إلتروكسين',
      'ator', 'أتور', 'crestor', 'كريستور', 'lipitor', 'ليبيتور', 'januvia', 'جانوفيا',
      'galvus', 'جالفوس', 'lantus', 'لانتوس', 'novorapid', 'نوفورابيد', 'micardis', 'ميكارديس',
      'co-diovan', 'كوديوفان', 'natrilix', 'ناتريليكس', 'aldactone', 'الداكتون', 'daonil', 'داونيل',
      'xarelto', 'زاريلتو', 'eliquis', 'إليكويس', 'brilinta', 'بريلينتا', 'norvasc', 'نورفاسك',
      'cordarone', 'كوردارون', 'lanoxin', 'لانكسين', 'lasix', 'لازيكس', 'tenormin', 'تينورمين'
    ],
    maxItems: 60
  },
  {
    name: 'مضادات حيوية ومطهرات بكتيرية',
    keywords: [
      'augmentin', 'أوجمنتين', 'curam', 'كيورام', 'hibiotic', 'هاي بيوتك', 'clavimox', 'كلافيموكس',
      'unasyn', 'يوناسين', 'zithromax', 'زيثروماكس', 'ciprocin', 'سيبروسين', 'tarivid', 'تارانيفيد',
      'flagyl', 'فلاجيل', 'dalacin', 'دلاسين', 'ceftriaxone', 'سفترياكسون', 'cefotax', 'سيفوتاكس',
      'ciprofar', 'سيبروفار', 'tavanic', 'تافانيك', 'flumox', 'فلوموكس', 'ibiamox', 'إيبياموكس',
      'antinal', 'أنتينال', 'streptophenicol', 'ستربتوفينيكول', 'duricef', 'ديوريسف', 'velosef', 'فيلوسيف',
      'klacid', 'كلاسيد', 'claritt', 'كلاريت', 'amikacin', 'أميكاسين', 'garamycin', 'جاراميسين'
    ],
    maxItems: 55
  },
  {
    name: 'أدوية الجهاز الهضمي والمعدة والكبد',
    keywords: [
      'omeprazole', 'أوميبرازول', 'nexium', 'نيكسيوم', 'controloc', 'كونترولوك', 'pantazol', 'بانتازول',
      'digestin', 'ديجستين', 'spasmofree', 'سبازموفري', 'colona', 'كولونا', 'motilium', 'موتيليوم',
      'maalox', 'مالوكس', 'gaviscon', 'جافيسكون', 'lactulose', 'لاكتيلوز', 'duphalac', 'دوفلاك',
      'bisadyl', 'بيساديل', 'mucogel', 'ميكوجيل', 'epicogel', 'إبيكوجيل', 'ranitidine', 'فوار راني',
      'coloverin', 'كولوفيرين', 'librax', 'ليبراكس', 'gastrazole', 'جاسترازول', 'omez', 'أوميز',
      'peptazol', 'بيبتيزول', 'spasmocanulase', 'سبازموكانوليز', 'rowachol', 'رواكول', 'hepa-merz', 'هيباميرز'
    ],
    maxItems: 55
  }
];

// Helper to find matching drugs
const selectedDrugBarcodes = new Set();
const categoryItemsMap = new Map();

categories.forEach(catDef => {
  const matched = [];
  for (const kw of catDef.keywords) {
    const lkw = kw.toLowerCase();
    for (const d of allDrugs) {
      if (selectedDrugBarcodes.has(d.barcode)) continue;
      const combined = (d.tradeName + ' ' + d.sciName).toLowerCase();
      if (combined.includes(lkw)) {
        selectedDrugBarcodes.add(d.barcode);
        matched.push(d);
        if (matched.length >= catDef.maxItems) break;
      }
    }
    if (matched.length >= catDef.maxItems) break;
  }
  categoryItemsMap.set(catDef.name, matched);
  console.log(`Matched ${matched.length} items for ${catDef.name}`);
});

// Non-medicine categories (Supplies, Mother/Baby, Cosmetics)
const suppliesItems = [
  { barcode: '6224001110014', tradeName: 'سرنجة 3 سم معقمة سن ناعم (شريط 10 سرنجات)', sciName: 'سرنجات بلاستيكية طبية معقمة للاستخدام مرة واحدة', form: 'مستلزم طبي', strength: '3 مل / 3cc', manufacturer: 'ألترا ميديكا (Ultra)', therapeutic: 'مستلزمات وإسعافات', storage: 'درج المستلزمات الطبية', isRefrig: 'لا', route: 'حقن (عضل/وريد)', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'علبة 100 سرنجة', pieces: 10, price: 3.5 },
  { barcode: '6224001110021', tradeName: 'سرنجة 5 سم معقمة (شريط 10 سرنجات)', sciName: 'سرنجات طبية 5 مل', form: 'مستلزم طبي', strength: '5 مل / 5cc', manufacturer: 'ألترا ميديكا (Ultra)', therapeutic: 'مستلزمات وإسعافات', storage: 'درج المستلزمات الطبية', isRefrig: 'لا', route: 'حقن (عضل/وريد)', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'علبة 100 سرنجة', pieces: 10, price: 4.0 },
  { barcode: '6224001110038', tradeName: 'سرنجة أنسولين 100 وحدة معقمة 1 مل', sciName: 'سرنجات أنسولين دقيقة U-100 سن قصير', form: 'مستلزم طبي', strength: '100 وحدة / 1ml', manufacturer: 'بي دي (BD)', therapeutic: 'مستلزمات وإسعافات', storage: 'درج المستلزمات الطبية', isRefrig: 'لا', route: 'حقن تحت الجلد (SC)', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'كيس 10 سرنجات', pieces: 10, price: 6.0 },
  { barcode: '6224001110045', tradeName: 'كحول إيثيلي نقي 70% بخاخ 120 مل', sciName: 'Ethanol 70% Ethyl Alcohol Antiseptic', form: 'سبراي مطهر', strength: '70% - 120ml', manufacturer: 'إيفا فارما (Eva Pharma)', therapeutic: 'مطهرات ومعقمات', storage: 'رف المطهرات والإسعافات', isRefrig: 'لا', route: 'موضعي للجلد والأسطح', pregnancy: 'آمن للاستخدام الخارجي', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'زجاجة بخاخ 120 مل', pieces: 1, price: 25.0 },
  { barcode: '6224001110052', tradeName: 'بيتادين محلول مطهر للجروح 10% (120 مل)', sciName: 'Povidone Iodine 10% Antiseptic Solution', form: 'محلول موضعي', strength: '10% - 120ml', manufacturer: 'النيل للأدوية ومونديفارما', therapeutic: 'مطهرات جروح وحروق', storage: 'رف المطهرات والإسعافات', isRefrig: 'لا', route: 'موضعي خارجي', pregnancy: 'فئة C (بحذر للغدة)', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'زجاجة بلاستيك 120 مل', pieces: 1, price: 45.0 },
  { barcode: '6224001110069', tradeName: 'قطن طبي معقم ممتص للدم والسوائل 100 جم', sciName: 'Pure Absorbent Surgical Cotton Wool', form: 'قطن طبي', strength: '100 جرام', manufacturer: 'غزل المحلة الطبي', therapeutic: 'مستلزمات وإسعافات', storage: 'رف الضمادات والقطن', isRefrig: 'لا', route: 'موضعي خارجي', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'لفة قطن 100 جم', pieces: 1, price: 22.0 },
  { barcode: '6224001110076', tradeName: 'شاش طبي معقم مقاس 10 سم × 10 سم (5 شاشات)', sciName: 'Sterile Gauze Swabs 10x10 cm', form: 'شاش طبي', strength: '10x10 cm', manufacturer: 'ألترا ميديكا', therapeutic: 'مستلزمات وإسعافات', storage: 'رف الضمادات والقطن', isRefrig: 'لا', route: 'موضعي خارجي', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'باكت 5 شاشات معقمة', pieces: 1, price: 15.0 },
  { barcode: '6224001110083', tradeName: 'بلاستر طبي حريري لاصق للجروح 5 سم × 5 متر', sciName: 'Medical Adhesive Silk Plaster Tape', form: 'شريط لاصق', strength: '5cm x 5m', manufacturer: 'ميديكال تيب', therapeutic: 'مستلزمات وإسعافات', storage: 'رف الضمادات والقطن', isRefrig: 'لا', route: 'موضعي خارجي', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'بكرة لاصق 5 متر', pieces: 1, price: 30.0 },
  { barcode: '6224001110090', tradeName: 'ترمومتر طبي رقمي سريع القياس مع شاشة LCD', sciName: 'Digital Clinical Thermometer LCD', form: 'جهاز طبي', strength: '1 وحدة', manufacturer: 'جرانزيا (Granzia)', therapeutic: 'أجهزة قياس طبية', storage: 'فاترينة الأجهزة الطبية', isRefrig: 'لا', route: 'قياس فموي وتحت الإبط', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'جهاز في علبة بلاستيك', pieces: 1, price: 85.0 },
  { barcode: '6224001110106', tradeName: 'قفازات طبية فحص لاتكس معقمة مقاس M (علبة 100 قفاز)', sciName: 'Latex Examination Medical Gloves Powder-Free', form: 'قفازات طبية', strength: 'مقاس وسط Medium', manufacturer: 'ماليزيا الطبية', therapeutic: 'مستلزمات وقاية', storage: 'رف القفازات والماسكات', isRefrig: 'لا', route: 'ارتداء يدوي', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'علبة كرتون 100 قفاز', pieces: 100, price: 160.0 }
];

const motherBabyItems = [
  { barcode: '6221155010011', tradeName: 'حفاضات بامبرز عناية مميزة مقاس 1 حديثي الولادة (60 حفاضة)', sciName: 'Pampers Premium Protection Diapers Size 1 Newborn', form: 'حفاضات أطفال', strength: 'مقاس 1 (2-5 كجم)', manufacturer: 'بروكتر آند جامبل (P&G)', therapeutic: 'عناية بالطفل', storage: 'رف حفاضات الأطفال', isRefrig: 'لا', route: 'ارتداء للرضع', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'عبوة توفير 60 حفاضة', pieces: 60, price: 295.0 },
  { barcode: '6221155010028', tradeName: 'حفاضات مولفيكس مقاس 3 وسط مع لوشن مهدئ (58 حفاضة)', sciName: 'Molfix Baby Diapers Size 3 Midi', form: 'حفاضات أطفال', strength: 'مقاس 3 (4-9 كجم)', manufacturer: 'حياة إيجيبت (Hayat)', therapeutic: 'عناية بالطفل', storage: 'رف حفاضات الأطفال', isRefrig: 'لا', route: 'ارتداء للرضع', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'عبوة اقتصادية 58 حفاضة', pieces: 58, price: 260.0 },
  { barcode: '6221155010035', tradeName: 'شامبو أطفال جونسون لا دموع بعد اليوم 500 مل', sciName: 'Johnson Baby Shampoo No More Tears 500ml', form: 'شامبو أطفال', strength: '500 مل', manufacturer: 'جونسون آند جونسون (J&J)', therapeutic: 'استحمام وعناية بالطفل', storage: 'رف مستحضرات الأطفال', isRefrig: 'لا', route: 'استحمام موضعي', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'زجاجة مضخة 500 مل', pieces: 1, price: 95.0 },
  { barcode: '6221155010042', tradeName: 'زيت أطفال جونسون بالصبار لترطيب بشرة الرضع 200 مل', sciName: 'Johnson Baby Oil with Aloe Vera 200ml', form: 'زيت ترطيب', strength: '200 مل', manufacturer: 'جونسون آند جونسون', therapeutic: 'ترطيب وحماية الطفل', storage: 'رف مستحضرات الأطفال', isRefrig: 'لا', route: 'موضعي للجلد', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'زجاجة بلاستيك 200 مل', pieces: 1, price: 75.0 },
  { barcode: '6221155010059', tradeName: 'سودوكريم كريم ملطف وواقي من التهابات الحفاض 125 جم', sciName: 'Sudocrem Antiseptic Healing Zinc Cream 125g', form: 'كريم ملطف', strength: '125 جرام', manufacturer: 'تيفا فارما (Teva)', therapeutic: 'علاج التهاب الحفاض', storage: 'رف مراهم الأطفال', isRefrig: 'لا', route: 'موضعي للجلد مع كل حفاض', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'برطمان رمادي 125 جم', pieces: 1, price: 185.0 },
  { barcode: '6221155010066', tradeName: 'زنك أوليف كريم زنك وزيت زيتون لالتهابات الحفاض 75 جم', sciName: 'Zinc Oxide + Olive Oil + Castor Oil Cream', form: 'كريم ملطف', strength: '75 جرام', manufacturer: 'الشركة الفرعونية للأدوية', therapeutic: 'وقاية وعلاج التسلخات', storage: 'رف مراهم الأطفال', isRefrig: 'لا', route: 'موضعي للجلد', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'أنبوبة 75 جم', pieces: 1, price: 42.0 },
  { barcode: '6221155010073', tradeName: 'ببرونة شيكو ناتشورال فيلينج زجاج مضادة للمغص 150 مل', sciName: 'Chicco NaturalFeeling Anti-Colic Glass Bottle 150ml', form: 'ببرونة رضاعة', strength: '150 مل', manufacturer: 'شيكو إيطاليا (Chicco)', therapeutic: 'تغذية ورضاعة', storage: 'فاترينة مستلزمات الرضع', isRefrig: 'لا', route: 'تغذية فموية', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'علبة كرتون بها ببرونة وحلمة', pieces: 1, price: 240.0 },
  { barcode: '6221155010080', tradeName: 'لهاية أطفال أفينت سيليكون فائقة النعومة 0-6 شهور (2 قطعة)', sciName: 'Philips Avent Ultra Soft Silicone Soothers 0-6m', form: 'لهاية سيليكون', strength: '0-6 شهور', manufacturer: 'فيليبس أفينت (Avent)', therapeutic: 'مهدئات الرضع', storage: 'فاترينة مستلزمات الرضع', isRefrig: 'لا', route: 'مص فموي', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'علبة تعقيم بها 2 لهاية', pieces: 2, price: 190.0 }
];

const cosmeticsItems = [
  { barcode: '6223000551011', tradeName: 'بانثينول كريم مرطب ومجدد لخلايا الجلد 50 جم', sciName: 'Dexpanthenol 5% Moisturizing Skin Cream', form: 'كريم مرطب', strength: '5% - 50g', manufacturer: 'النيل للأدوية والصناعات الكيماوية', therapeutic: 'ترطيب وتجديد البشرة', storage: 'رف كريمات العناية بالبشرة', isRefrig: 'لا', route: 'موضعي للوجه والجسم', pregnancy: 'آمن (فئة A)', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'أنبوبة ألومنيوم 50 جم', pieces: 1, price: 30.0 },
  { barcode: '6223000551028', tradeName: 'لاروش بوزيه أنثيليوس واقي شمس سائل SPF 50+ خالي من الزيوت 50 مل', sciName: 'La Roche-Posay Anthelios UVMune 400 Oil Control Fluid SPF50+', form: 'سائل واقي شمس', strength: 'SPF 50+ / 50ml', manufacturer: 'لاروش بوزيه فرنسا (L\'Oreal)', therapeutic: 'حماية من أشعة الشمس', storage: 'ستاند الديرما كوزماتيكس', isRefrig: 'لا', route: 'موضعي للوجه قبل التعرض للشمس', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'زجاجة فلويد 50 مل', pieces: 1, price: 620.0 },
  { barcode: '6223000551035', tradeName: 'سيرافيه غسول رغوي للبشرة العادية إلى الدهنية بالسيراميد 236 مل', sciName: 'CeraVe Foaming Cleanser Niacinamide + Ceramides 236ml', form: 'غسول رغوي', strength: '236 مل', manufacturer: 'سيرافيه فرنسا (L\'Oreal)', therapeutic: 'تنظيف وتطهير الوجه', storage: 'ستاند الديرما كوزماتيكس', isRefrig: 'لا', route: 'غسيل يومي موضعي', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'زجاجة مضخة 236 مل', pieces: 1, price: 440.0 },
  { barcode: '6223000551042', tradeName: 'بيوديرما سينسيبيو ماء ميسيلار مزيل للمكياج للبشرة الحساسة 250 مل', sciName: 'Bioderma Sensibio H2O Micellar Water 250ml', form: 'محلول ميسيلار', strength: '250 مل', manufacturer: 'بيوديرما فرنسا (NAOS)', therapeutic: 'تنظيف وإزالة المكياج', storage: 'ستاند الديرما كوزماتيكس', isRefrig: 'لا', route: 'مسح موضعي بقطنة', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'زجاجة وردية 250 مل', pieces: 1, price: 380.0 },
  { barcode: '6223000551059', tradeName: 'إيفا كولاجين كريم النهار لشد البشرة ومقاومة التجاعيد 50 مل', sciName: 'Eva Skin Clinic Collagen Day Cream with SPF15', form: 'كريم مضاد تجاعيد', strength: '50 مل', manufacturer: 'إيفا كوزماتيكس (Eva Cosmetics)', therapeutic: 'مقاومة التجاعيد ونضارة الوجه', storage: 'رف مستحضرات التجميل', isRefrig: 'لا', route: 'موضعي صباحي', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'برطمان زجاج 50 مل', pieces: 1, price: 165.0 },
  { barcode: '6223000551066', tradeName: 'نيفيا سوفت كريم ترطيب منعش بالصبار وفيتامين E (100 مل)', sciName: 'Nivea Soft Refreshing Moisturizing Cream Aloe Vera 100ml', form: 'كريم ترطيب', strength: '100 مل', manufacturer: 'بايرسدورف ألمانيا (Beiersdorf)', therapeutic: 'ترطيب عام لليدين والجسم', storage: 'رف كريمات العناية بالبشرة', isRefrig: 'لا', route: 'موضعي للجلد', pregnancy: 'آمن', isAntibiotic: 'لا', rxStatus: 'صرف مباشر (OTC)', packDesc: 'علبة بيضاء 100 مل', pieces: 1, price: 70.0 }
];

categoryItemsMap.set('مستلزمات وإسعافات', suppliesItems);
categoryItemsMap.set('عناية بالأم والطفل', motherBabyItems);
categoryItemsMap.set('تجميل وعناية بالبشرة', cosmeticsItems);

// Now build the master Excel workbook
const wb = xlsx.utils.book_new();

const headers = [
  'م',
  'باركود الدواء *',
  'الاسم التجاري (عربي / إنجليزي) *',
  'الاسم العلمي (المادة الفعالة والتركيبة) *',
  'الشكل الدوائي (Dosage Form)',
  'التركيز والحجم',
  'الشركة المصنعة (Manufacturer)',
  'المجموعة العلاجية (Therapeutic Class)',
  'مكان التخزين / الرف / الدرج',
  'الوحدة الأساسية (علبة / قطعة)',
  'سعر الجمهور الرسمي (ج.م) *',
  'سعر التكلفة / الشراء (ج.م) *',
  'الرصيد الافتتاحي (علب)',
  'حد الطلب الأدنى',
  'هامش ربح العلبة (ج.م)',
  'نسبة الربح (%)',
  'إجمالي قيمة التكلفة (ج.م)',
  'إجمالي القيمة البيعية (ج.م)',
  'إجمالي الربح المتوقع (ج.م)',
  'حالة المخزون التلقائية',
  'طريقة الاستخدام (Route)',
  'فئة أمان الحمل والرضاعة',
  'مضاد حيوي (نعم / لا)',
  'سلسلة التبريد / ثلاجة (نعم / لا)',
  'نوع الوصفة والصرف (Rx Status)',
  'عدد الوحدات / الأشرطة بالعلبة',
  'نسبة الضريبة (%)',
  'كود الصنف الداخلي (SKU)'
];

const colWidths = [
  { wch: 6 },  // م
  { wch: 18 }, // باركود
  { wch: 45 }, // الاسم التجاري
  { wch: 42 }, // الاسم العلمي
  { wch: 18 }, // الشكل
  { wch: 16 }, // التركيز
  { wch: 25 }, // الشركة
  { wch: 32 }, // المجموعة
  { wch: 24 }, // مكان التخزين
  { wch: 16 }, // الوحدة
  { wch: 18 }, // سعر الجمهور
  { wch: 18 }, // سعر التكلفة
  { wch: 16 }, // الرصيد
  { wch: 16 }, // حد الطلب
  { wch: 16 }, // هامش الربح
  { wch: 14 }, // نسبة الربح
  { wch: 18 }, // إجمالي التكلفة
  { wch: 18 }, // إجمالي البيع
  { wch: 18 }, // إجمالي الربح
  { wch: 16 }, // حالة المخزون
  { wch: 22 }, // طريقة الاستخدام
  { wch: 24 }, // فئة أمان الحمل
  { wch: 15 }, // مضاد حيوي
  { wch: 18 }, // سلسلة التبريد
  { wch: 18 }, // نوع الوصفة
  { wch: 18 }, // عدد الأشرطة
  { wch: 14 }, // نسبة الضريبة
  { wch: 16 }  // SKU
];

let globalItemCounter = 0;
let skuNum = 1;

categoryItemsMap.forEach((items, catName) => {
  const titleRow = ['رفيق POS - قائمة أصناف قسم: [' + catName + ']'];
  const instRow = ['تعليمات هامة: الأعمدة المميزة بنجمة (*) إلزامية | يتضمن النموذج كافة البيانات السريرية والصيدلية المعتمدة | المعادلات المالية والمخزنية تتحدث تلقائياً'];

  const dataRows = items.map((item, idx) => {
    globalItemCounter++;
    const rowNum = idx + 4; // Excel 1-based row (row 1=title, row 2=inst, row 3=headers, row 4=first data)
    const price = Number(item.price.toFixed(2));
    const cost = Number((price * 0.77).toFixed(2)); // Standard 23% pharmacy margin
    const stock = 20;
    const minStock = 5;

    const profit = Number((price - cost).toFixed(2));
    const marginPct = cost > 0 ? Number((profit / cost).toFixed(4)) : 0;
    const totalCost = Number((cost * stock).toFixed(2));
    const totalSale = Number((price * stock).toFixed(2));
    const totalProfit = Number((totalSale - totalCost).toFixed(2));
    const stockStatus = stock === 0 ? 'نافد' : (stock <= minStock ? 'قرب ينفد' : 'متوفر');

    const profitFormula = `K${rowNum}-L${rowNum}`;
    const marginFormula = `IF(L${rowNum}>0,O${rowNum}/L${rowNum},0)`;
    const totalCostFormula = `L${rowNum}*M${rowNum}`;
    const totalSaleFormula = `K${rowNum}*M${rowNum}`;
    const totalProfitFormula = `R${rowNum}-Q${rowNum}`;
    const stockStatusFormula = `IF(M${rowNum}=0,"نافد",IF(M${rowNum}<=N${rowNum},"قرب ينفد","متوفر"))`;

    return [
      idx + 1,
      item.barcode,
      item.tradeName,
      item.sciName,
      item.form,
      item.strength,
      item.manufacturer,
      item.therapeutic,
      item.storage || ('رف ' + catName.substring(0, 15)),
      item.form.includes('أقراص') || item.form.includes('كبسول') ? 'علبة' : 'قطعة',
      price,
      cost,
      stock,
      minStock,
      { f: profitFormula, v: profit, t: 'n', z: '#,##0.00' },
      { f: marginFormula, v: marginPct, t: 'n', z: '0.00%' },
      { f: totalCostFormula, v: totalCost, t: 'n', z: '#,##0.00' },
      { f: totalSaleFormula, v: totalSale, t: 'n', z: '#,##0.00' },
      { f: totalProfitFormula, v: totalProfit, t: 'n', z: '#,##0.00' },
      { f: stockStatusFormula, v: stockStatus, t: 's' },
      item.route,
      item.pregnancy,
      item.isAntibiotic,
      item.isRefrig,
      item.rxStatus,
      item.pieces || 1,
      0,
      'MED-' + String(skuNum++).padStart(4, '0')
    ];
  });

  const lastDataRow = dataRows.length + 3;
  const avgPrice = items.length ? Number((items.reduce((s, it) => s + it.price, 0) / items.length).toFixed(2)) : 0;
  const avgCost = Number((avgPrice * 0.77).toFixed(2));
  const totalStock = items.length * 20;
  const totalMinStock = items.length * 5;
  const avgProfit = Number((avgPrice - avgCost).toFixed(2));
  const avgMarginPct = avgCost > 0 ? Number((avgProfit / avgCost).toFixed(4)) : 0;
  const sumCost = Number((avgCost * totalStock).toFixed(2));
  const sumSale = Number((avgPrice * totalStock).toFixed(2));
  const sumProfit = Number((sumSale - sumCost).toFixed(2));

  const summaryRow = [
    'الإجمالي',
    'عدد الأصناف: ' + items.length,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    { f: `AVERAGE(K4:K${lastDataRow})`, v: avgPrice, t: 'n', z: '#,##0.00' },
    { f: `AVERAGE(L4:L${lastDataRow})`, v: avgCost, t: 'n', z: '#,##0.00' },
    { f: `SUM(M4:M${lastDataRow})`, v: totalStock, t: 'n', z: '#,##0' },
    { f: `SUM(N4:N${lastDataRow})`, v: totalMinStock, t: 'n', z: '#,##0' },
    { f: `AVERAGE(O4:O${lastDataRow})`, v: avgProfit, t: 'n', z: '#,##0.00' },
    { f: `AVERAGE(P4:P${lastDataRow})`, v: avgMarginPct, t: 'n', z: '0.00%' },
    { f: `SUM(Q4:Q${lastDataRow})`, v: sumCost, t: 'n', z: '#,##0.00' },
    { f: `SUM(R4:R${lastDataRow})`, v: sumSale, t: 'n', z: '#,##0.00' },
    { f: `SUM(S4:S${lastDataRow})`, v: sumProfit, t: 'n', z: '#,##0.00' },
    'محسوب بمعادلات إكسل',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ];

  const allSheetRows = [titleRow, instRow, headers, ...dataRows, summaryRow];
  const ws = xlsx.utils.aoa_to_sheet(allSheetRows);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 27 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 27 } }
  ];

  ws['!cols'] = colWidths;
  ws['!views'] = [{ rightToLeft: true }];

  // Sheet name clean
  let safeSheetName = catName.substring(0, 30).replace(/[:\\\/\?\*\[\]]/g, '');
  xlsx.utils.book_append_sheet(wb, ws, safeSheetName);
});

xlsx.writeFile(wb, OUTPUT_PATH, { bookType: 'xlsx', compression: true });
console.log(`[SUCCESS] Master Pharmacy Template generated at: ${OUTPUT_PATH}`);
console.log(`Total items included across all sheets: ${globalItemCounter}`);
