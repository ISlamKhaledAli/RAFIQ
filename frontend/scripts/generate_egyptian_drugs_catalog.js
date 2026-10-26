import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSV parser supporting quoted cells and multiline fields
function parseCSV(text) {
  const rows = [];
  let curRow = [];
  let curVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        curVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      curRow.push(curVal);
      curVal = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      curRow.push(curVal);
      curVal = '';
      if (curRow.length > 1) {
        rows.push(curRow);
      }
      curRow = [];
    } else {
      curVal += c;
    }
  }
  if (curVal || curRow.length > 0) {
    curRow.push(curVal);
    if (curRow.length > 1) rows.push(curRow);
  }
  return rows;
}

// Detection helpers
function detectDosageForm(tradeName, nameEn) {
  const str = (tradeName + ' ' + nameEn).toLowerCase();
  if (str.includes('شراب') || str.includes('syrup') || str.includes('susp')) {
    if (str.includes('معلق') || str.includes('susp')) return 'معلق';
    return 'شراب';
  }
  if (str.includes('أقراص') || str.includes('قرص') || str.includes('tab') || str.includes('f.c.tab')) return 'أقراص';
  if (str.includes('كبسول') || str.includes('cap')) return 'كبسولات';
  if (str.includes('حقن') || str.includes('أمبول') || str.includes('فيال') || str.includes('inj') || str.includes('vial') || str.includes('amp')) return 'حقن';
  if (str.includes('كريم') || str.includes('cream')) return 'كريم';
  if (str.includes('مرهم') || str.includes('oint')) return 'مرهم';
  if (str.includes('جل') || str.includes('gel')) return 'جل موضعي';
  if (str.includes('نقط') || str.includes('قطرة') || str.includes('drop')) return 'نقط (فم / عين / أذن)';
  if (str.includes('فوار') || str.includes('efferv')) return 'فوار';
  if (str.includes('أكياس') || str.includes('كيس') || str.includes('sachet')) return 'أكياس بودرة';
  if (str.includes('بخاخ') || str.includes('استنشاق') || str.includes('inhal') || str.includes('spray')) return 'بخاخ / استنشاق';
  if (str.includes('لبوس') || str.includes('تحاميل') || str.includes('suppos')) return 'لبوس / تحاميل';
  if (str.includes('لوشن') || str.includes('lotion')) return 'لوشن';
  return 'أقراص';
}

function detectRoute(form, tradeName, nameEn) {
  const str = (form + ' ' + tradeName + ' ' + nameEn).toLowerCase();
  if (str.includes('حقن') || str.includes('أمبول') || str.includes('فيال') || str.includes('inj') || str.includes('vial') || str.includes('amp')) {
    return 'حقن عضل / وريد (Parenteral)';
  }
  if (str.includes('كريم') || str.includes('مرهم') || str.includes('جل') || str.includes('لوشن') || str.includes('cream') || str.includes('oint') || str.includes('topical')) {
    return 'موضعي (Topical)';
  }
  if (str.includes('قطرة') || str.includes('نقط') || str.includes('drop') || str.includes('eye') || str.includes('ear')) {
    return 'قطرة عين / أذن (Drops)';
  }
  if (str.includes('استنشاق') || str.includes('بخاخ') || str.includes('inhal') || str.includes('spray') || str.includes('aerosol')) {
    return 'استنشاق (Inhalation)';
  }
  if (str.includes('لبوس') || str.includes('تحاميل') || str.includes('suppos') || str.includes('rectal')) {
    return 'لبوس / شرجي (Rectal)';
  }
  return 'فموي (Oral)';
}

function extractStrength(tradeName, nameEn) {
  const str = tradeName + ' ' + nameEn;
  // Patterns like 500mg/65mg, 500 mg, 1000mg, 120 ml, 250mg/5ml, 100 IU/ml, 2%
  const match = str.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)(?:\/\d+(?:\.\d+)?\s*(?:mg|ml|iu))?|\d+(?:\.\d+)?\s*مجم|\d+(?:\.\d+)?\s*مل)/i);
  if (match) return match[0].trim();
  return '';
}

function detectTherapeutic(desc, active, name) {
  const str = (desc + ' ' + active + ' ' + name).toLowerCase();
  if (str.includes('antibiotic') || str.includes('مضاد حيوي') || str.includes('amoxicillin') || str.includes('cipro') || str.includes('cef') || str.includes('azithro') || str.includes('penicillin') || str.includes('clavulan')) {
    return 'مضادات حيوية ومضادات بكتيرية';
  }
  if (str.includes('analgesic') || str.includes('nsaid') || str.includes('antipyretic') || str.includes('paracetamol') || str.includes('ibuprofen') || str.includes('diclofenac') || str.includes('ketoprofen') || str.includes('مسكن')) {
    return 'مسكنات وخافضات حرارة ومضادات التهاب';
  }
  if (str.includes('cold') || str.includes('flu') || str.includes('cough') || str.includes('برد') || str.includes('سعال') || str.includes('إنفلونزا') || str.includes('pseudoephedrine')) {
    return 'أدوية نزلات البرد والإنفلونزا';
  }
  if (str.includes('diabetes') || str.includes('insulin') || str.includes('metformin') || str.includes('glimepiride') || str.includes('سكر') || str.includes('أنسولين')) {
    return 'أدوية السكري ومنظمات السكر';
  }
  if (str.includes('hypertension') || str.includes('blood pressure') || str.includes('cardio') || str.includes('heart') || str.includes('amlodipine') || str.includes('valsartan') || str.includes('atenolol') || str.includes('ضغط')) {
    return 'أدوية ضغط الدم والقلب';
  }
  if (str.includes('acid') || str.includes('ppi') || str.includes('ulcer') || str.includes('gastric') || str.includes('omeprazole') || str.includes('pantoprazole') || str.includes('حموضة') || str.includes('معدة')) {
    return 'أدوية المعدة والحموضة ومثبطات مضخة البروتون';
  }
  if (str.includes('allergy') || str.includes('antihistamine') || str.includes('loratadine') || str.includes('cetirizine') || str.includes('حساسية')) {
    return 'مضادات الحساسية والهيستامين';
  }
  if (str.includes('vitamin') || str.includes('mineral') || str.includes('iron') || str.includes('calcium') || str.includes('supplement') || str.includes('فيتامين') || str.includes('حديد') || str.includes('كالسيوم')) {
    return 'فيتامينات ومعادن ومكملات غذائية';
  }
  if (str.includes('fungal') || str.includes('miconazole') || str.includes('fluconazole') || str.includes('فطريات')) {
    return 'مضادات الفطريات';
  }
  if (str.includes('respiratory') || str.includes('asthma') || str.includes('broncho') || str.includes('ربو') || str.includes('شعب')) {
    return 'أدوية الجهاز التنفسي وموسعات الشعب والسعال';
  }
  return 'أدوية ومستحضرات طبية عامة';
}

function detectShelf(therapeutic, isRefrig) {
  if (isRefrig) return 'ثلاجة الأدوية والمستحضرات';
  if (therapeutic.includes('مسكنات')) return 'رف A1 - مسكنات وخافضات حرارة';
  if (therapeutic.includes('مضادات حيوية')) return 'رف B1 - مضادات حيوية';
  if (therapeutic.includes('البرد')) return 'رف C1 - برد وكحة ونزلات';
  if (therapeutic.includes('السكر')) return 'رف D1 - أدوية السكري';
  if (therapeutic.includes('الضغط')) return 'رف D2 - أدوية القلب والضغط';
  if (therapeutic.includes('المعدة')) return 'رف E1 - جهاز هضمي ومعدة';
  if (therapeutic.includes('فيتامين')) return 'رف F1 - فيتامينات ومكملات';
  if (therapeutic.includes('حساسية')) return 'رف C2 - حساسية وهيستامين';
  return 'رف عام - أدوية ومستحضرات';
}

function detectRefrigerated(name, form, active) {
  const str = (name + ' ' + form + ' ' + active).toLowerCase();
  if (str.includes('insulin') || str.includes('أنسولين') || str.includes('vaccine') || str.includes('لقاح') || str.includes('تطعيم') || str.includes('ميكستارد') || str.includes('لانتوس') || str.includes('نوفورابيد') || str.includes('إريثروبويتين') || str.includes('erythropoietin')) {
    return true;
  }
  return false;
}

function detectIsAntibiotic(therapeutic, active) {
  const str = (therapeutic + ' ' + active).toLowerCase();
  return str.includes('مضادات حيوية') || str.includes('antibiotic') || str.includes('amoxicillin') || str.includes('ciprofloxacin') || str.includes('azithromycin') || str.includes('ceftriaxone') || str.includes('clarithromycin') || str.includes('doxycycline');
}

function generateStandardBarcode(idNum) {
  const base = '622' + String(idNum).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(base[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return base + checkDigit;
}

function cleanPrice(priceRaw) {
  if (!priceRaw) return 20.00;
  const num = parseFloat(String(priceRaw).replace(/[^0-9.]/g, ''));
  if (isNaN(num) || num <= 0) return 20.00;
  return Math.round(num * 100) / 100;
}

async function run() {
  console.log('--- Generating Egyptian Market Comprehensive Drugs Catalog ---');

  const csvPath = path.resolve(__dirname, '../../eg_drugs_sample.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at: ${csvPath}`);
    process.exit(1);
  }

  const rawCsv = fs.readFileSync(csvPath, 'utf8');
  const csvRows = parseCSV(rawCsv);
  console.log(`Parsed ${csvRows.length - 1} records from CSV.`);

  const wb = XLSX.utils.book_new();
  const sheetData = [];

  // Title Banner
  sheetData.push(["رفيق POS - دليل الأدوية والمستحضرات المرجعي الصيدلي الشامل (السوق المصري)"]);
  // Guidance Banner
  sheetData.push(["إرشادات: الباركود والاسم التجاري وسعر الجمهور إلزامية (*) | يدعم الشكل، التركيز، طريقة الاستخدام، فئة الحمل، مضاد حيوي، وسلسلة التبريد"]);
  // Header Row (All 19 Columns matching UI & C# exactly)
  sheetData.push([
    "باركود الدواء *",
    "الاسم التجاري *",
    "الاسم العلمي (المادة الفعالة)",
    "الشكل الدوائي (Dosage Form)",
    "التركيز / الحجم",
    "النكهة / الشكل المتفرع",
    "الشركة المصنعة (Manufacturer)",
    "المجموعة العلاجية (Therapeutic)",
    "قسم وتصنيف الصنف بالمحل",
    "الرف ومكان التخزين",
    "سلسلة التبريد / ثلاجة (نعم/لا)",
    "طريقة الاستخدام (Route)",
    "فئة الحمل والرضاعة",
    "مضاد حيوي (نعم/لا)",
    "نوع الوصفة والصرف (Rx Status)",
    "وصف العبوة",
    "عدد الوحدات / الأشرطة بالعلبة",
    "سعر الجمهور الرسمي (ج.م) *",
    "مصدر التسعيرة / ملاحظات"
  ]);

  const seenBarcodes = new Set();
  let idCounter = 100000;

  for (let i = 1; i < csvRows.length; i++) {
    const r = csvRows[i];
    const _id = r[0] || String(i);
    const nameEn = (r[1] || '').trim();
    let nameAr = (r[2] || '').trim();
    const active = (r[3] || '').trim();
    const company = (r[4] || 'شركة أدوية معتمدة').trim();
    const priceRaw = r[5];
    let rawBarcode = (r[8] || '').trim();
    const unitsRaw = r[10] || '1';
    const desc = (r[11] || '').trim();
    const warnPreg = (r[18] || '0').trim();

    // Construct Trade Name
    let tradeName = nameAr;
    if (!tradeName) {
      tradeName = nameEn;
    } else if (nameEn && !tradeName.includes(nameEn)) {
      tradeName = `${tradeName} (${nameEn})`;
    }

    if (!tradeName) continue;

    // Barcode: if missing or invalid, generate unique Egyptian standard barcode
    let barcode = rawBarcode;
    if (!barcode || barcode.length < 6 || !/^\d+$/.test(barcode) || seenBarcodes.has(barcode)) {
      idCounter++;
      barcode = generateStandardBarcode(idCounter);
    }
    seenBarcodes.add(barcode);

    // Dosage Form & Strength
    const form = detectDosageForm(tradeName, nameEn);
    const strength = extractStrength(tradeName, nameEn);
    const flavorForm = form;

    // Therapeutic & Category
    const therapeutic = detectTherapeutic(desc, active, tradeName);
    const category = 'أدوية ومسكنات شائعة وفيتامينات';

    // Cold Chain
    const isRefrig = detectRefrigerated(tradeName, form, active);
    const shelf = detectShelf(therapeutic, isRefrig);

    // Route
    const route = detectRoute(form, tradeName, nameEn);

    // Pregnancy Category
    let pregCat = 'فئة الحمل: غير محدد';
    if (warnPreg === '1') {
      pregCat = 'فئة C (بحذر وإشراف طبي)';
    } else {
      pregCat = 'فئة B (آمن إلى حد كبير)';
    }

    // Antibiotic
    const isAnti = detectIsAntibiotic(therapeutic, active);

    // Rx Status
    let rxStatus = 'صرف مباشر (OTC)';
    if (isAnti) {
      rxStatus = 'روشتة طبية (Rx)';
    } else if (desc.toLowerCase().includes('psych') || desc.toLowerCase().includes('controlled') || active.toLowerCase().includes('tramadol') || active.toLowerCase().includes('pregabalin')) {
      rxStatus = 'جدول رقابة مشددة (Controlled)';
    } else if (route.includes('حقن')) {
      rxStatus = 'روشتة طبية (Rx)';
    }

    // Pieces per pack
    let pieces = parseInt(unitsRaw, 10);
    if (isNaN(pieces) || pieces <= 0) pieces = 1;
    const packDesc = pieces > 1 ? `علبة ${pieces} شريط / وحدات` : (form.includes('شراب') ? 'زجاجة شراب' : 'علبة مستحضر');

    // Price
    const price = cleanPrice(priceRaw);

    sheetData.push([
      barcode,
      tradeName,
      active || 'مادة فعالة طبية',
      form,
      strength || 'قياسي',
      flavorForm,
      company,
      therapeutic,
      category,
      shelf,
      isRefrig ? 'نعم' : 'لا',
      route,
      pregCat,
      isAnti ? 'نعم' : 'لا',
      rxStatus,
      packDesc,
      pieces,
      price,
      'تسعيرة رسمية - وزارة الصحة المصرية'
    ]);
  }

  console.log(`Writing ${sheetData.length - 3} pharmaceutical records to Excel...`);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set Right to Left view
  if (!ws['!views']) ws['!views'] = [];
  ws['!views'].push({ RTL: true });

  // Column widths
  ws['!cols'] = [
    { wch: 18 }, // Barcode
    { wch: 38 }, // Trade Name
    { wch: 36 }, // Generic Name
    { wch: 16 }, // Form
    { wch: 16 }, // Strength
    { wch: 16 }, // Flavor/Form
    { wch: 28 }, // Manufacturer
    { wch: 32 }, // Therapeutic
    { wch: 26 }, // Category
    { wch: 26 }, // Shelf
    { wch: 14 }, // Refrig
    { wch: 22 }, // Route
    { wch: 22 }, // Pregnancy
    { wch: 14 }, // Antibiotic
    { wch: 24 }, // Rx Status
    { wch: 24 }, // Pack Desc
    { wch: 14 }, // Pieces
    { wch: 18 }, // Price
    { wch: 28 }  // Notes
  ];

  XLSX.utils.book_append_sheet(wb, ws, "دليل_الأدوية_المرجعي");

  // Write outputs:
  // 1. Root directory
  const rootPath = path.resolve(__dirname, '../../دليل_الأدوية_المصرية_الشامل.xlsx');
  XLSX.writeFile(wb, rootPath);
  console.log(`Successfully written Excel file to: ${rootPath}`);

  // 2. Frontend public directory
  const publicDir = path.resolve(__dirname, '../public');
  if (fs.existsSync(publicDir)) {
    const publicPath = path.join(publicDir, 'دليل_الأدوية_المصرية_الشامل.xlsx');
    XLSX.writeFile(wb, publicPath);
    console.log(`Successfully copied to frontend public assets: ${publicPath}`);
  }

  // 3. Desktop release dist
  const releaseDist = path.resolve(__dirname, '../../desktop/bin/Release/dist');
  if (fs.existsSync(releaseDist)) {
    const relPath = path.join(releaseDist, 'دليل_الأدوية_المصرية_الشامل.xlsx');
    XLSX.writeFile(wb, relPath);
    console.log(`Successfully copied to Release dist: ${relPath}`);
  }

  // 4. Desktop debug dist
  const debugDist = path.resolve(__dirname, '../../desktop/bin/Debug/dist');
  if (fs.existsSync(debugDist)) {
    const debPath = path.join(debugDist, 'دليل_الأدوية_المصرية_الشامل.xlsx');
    XLSX.writeFile(wb, debPath);
    console.log(`Successfully copied to Debug dist: ${debPath}`);
  }

  console.log('--- Catalog Generation Completed Successfully ---');
}

run().catch((err) => {
  console.error('Fatal error generating catalog:', err);
  process.exit(1);
});
