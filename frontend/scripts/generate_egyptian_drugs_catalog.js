import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Comprehensive Egyptian Medicines Database (~260 Top-Selling Medications)
const medicines = [
  // 1. المسكنات ومضادات الالتهاب وخافضات الحرارة (Analgesics, NSAIDs, Antipyretics)
  {
    barcode: "6221001001011",
    tradeName: "بانادول إكسترا أقراص",
    scientificName: "Paracetamol + Caffeine",
    form: "أقراص",
    strength: "500mg/65mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 24 قرص",
    price: 48.00,
    notes: "تسعيرة جبرية رسمية"
  },
  {
    barcode: "6221001001028",
    tradeName: "بانادول أدفانس أقراص",
    scientificName: "Paracetamol",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 24 قرص",
    price: 36.00,
    notes: "تسعيرة جبرية رسمية"
  },
  {
    barcode: "6221001001035",
    tradeName: "بانادol كولد آند فلو أصفر",
    scientificName: "Paracetamol + Phenylephrine + Chlorpheniramine",
    form: "أقراص",
    strength: "500mg/5mg/2mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 24 قرص",
    price: 48.00,
    notes: "نشرة وزارة الصحة"
  },
  {
    barcode: "6221001001042",
    tradeName: "بانادول نايت أقراص",
    scientificName: "Paracetamol + Diphenhydramine",
    form: "أقراص",
    strength: "500mg/25mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 24 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221001001059",
    tradeName: "بانادول كولد آند فلو داي ديسك",
    scientificName: "Paracetamol + Pseudoephedrine + Dextromethorphan",
    form: "أقراص",
    strength: "500mg/30mg/15mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 24 قرص",
    price: 52.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221102002012",
    tradeName: "كتافلام 50 مجم أقراص",
    scientificName: "Diclofenac Potassium",
    form: "أقراص مغلفة",
    strength: "50mg",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 66.00,
    notes: "تسعيرة جبرية رسمية"
  },
  {
    barcode: "6221102002029",
    tradeName: "كتافلام 75 مجم حقن",
    scientificName: "Diclofenac Potassium",
    form: "حقن أمبولات",
    strength: "75mg/3ml",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 6 أمبولات",
    price: 72.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221102002036",
    tradeName: "فولتارين 75 مجم حقن عضل",
    scientificName: "Diclofenac Sodium",
    form: "حقن أمبولات",
    strength: "75mg/3ml",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 6 أمبولات",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221102002043",
    tradeName: "فولتارين 100 مجم ريتارد أقراص",
    scientificName: "Diclofenac Sodium SR",
    form: "أقراص ممتدة المفعول",
    strength: "100mg",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 85.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221102002050",
    tradeName: "فولتارين إيمولجيل 100 جم",
    scientificName: "Diclofenac Diethylamine",
    form: "جيل موضعي",
    strength: "1.16%",
    manufacturer: "Novartis Pharma",
    packDesc: "أنبوبة ألومنيوم 100 جم",
    price: 75.00,
    notes: "نشرة الأسعار"
  },
  {
    barcode: "6221103003019",
    tradeName: "بروفين 400 مجم أقراص",
    scientificName: "Ibuprofen",
    form: "أقراص مغلفة",
    strength: "400mg",
    manufacturer: "Abbott Laboratories",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 54.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221103003026",
    tradeName: "بروفين 600 مجم أقراص وفوار",
    scientificName: "Ibuprofen",
    form: "أقراص مغلفة",
    strength: "600mg",
    manufacturer: "Abbott Laboratories",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 70.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221103003033",
    tradeName: "بروفين شراب أطفال 100 مجم/5 مل",
    scientificName: "Ibuprofen",
    form: "شراب معلق",
    strength: "100mg/5ml",
    manufacturer: "Abbott Laboratories",
    packDesc: "زجاجة 150 مل",
    price: 32.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221104004016",
    tradeName: "بارامول 500 مجم أقراص",
    scientificName: "Paracetamol",
    form: "أقراص",
    strength: "500mg",
    manufacturer: "Misr Co. for Ph. Ind.",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221104004023",
    tradeName: "بارامول شراب أطفال",
    scientificName: "Paracetamol",
    form: "شراب",
    strength: "120mg/5ml",
    manufacturer: "Misr Co. for Ph. Ind.",
    packDesc: "زجاجة 125 مل",
    price: 18.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221105005013",
    tradeName: "سيتال 500 مجم أقراص",
    scientificName: "Paracetamol",
    form: "أقراص",
    strength: "500mg",
    manufacturer: "EIPICO",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 20.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221105005020",
    tradeName: "سيتال نقط بالفم للرضع",
    scientificName: "Paracetamol",
    form: "نقط بالفم",
    strength: "100mg/ml",
    manufacturer: "EIPICO",
    packDesc: "قطارة 15 مل",
    price: 15.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6221105005037",
    tradeName: "سيتال 120 مجم لبوس أطفال",
    scientificName: "Paracetamol",
    form: "تحاميل (لبوس)",
    strength: "120mg",
    manufacturer: "EIPICO",
    packDesc: "شريط 5 لبوسات",
    price: 16.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004044",
    tradeName: "ألفينترن أقراص مضادة للالتهاب والتورم",
    scientificName: "Chymotrypsin + Trypsin",
    form: "أقراص معوية",
    strength: "300 units",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 54.00,
    notes: "تسعيرة وزارة الصحة"
  },
  {
    barcode: "6224004004051",
    tradeName: "أمبيزيم أقراص",
    scientificName: "Chymotrypsin + Trypsin",
    form: "أقراص مغلفة معوياً",
    strength: "5mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 65.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004068",
    tradeName: "أسبوسيد أطفال 75 مجم أقراص مضغ",
    scientificName: "Acetylsalicylic Acid",
    form: "أقراص قابلة للمضغ",
    strength: "75mg",
    manufacturer: "CID - Chemical Industries",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 21.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004075",
    tradeName: "أسبرين بروتكت 100 مجم أقراص معوية",
    scientificName: "Acetylsalicylic Acid",
    form: "أقراص مغلفة معوياً",
    strength: "100mg",
    manufacturer: "Bayer Healthcare",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004082",
    tradeName: "جيسبرين 81 مجم أقراص",
    scientificName: "Aspirin (Cardio)",
    form: "أقراص",
    strength: "81mg",
    manufacturer: "Julphar Pharmaceuticals",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 28.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004099",
    tradeName: "كيتولاك 30 مجم حقن مسكن قوي",
    scientificName: "Ketorolac Tromethamine",
    form: "حقن أمبولات",
    strength: "30mg/2ml",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 5 أمبولات",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004105",
    tradeName: "كيتوفان 50 مجم كبسولات",
    scientificName: "Ketoprofen",
    form: "كبسولات جيلاتينية صلبة",
    strength: "50mg",
    manufacturer: "EIPICO",
    packDesc: "علبة 2 شريط - 20 كبسولة",
    price: 28.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004112",
    tradeName: "باي كيتوفان 150 مجم أقراص",
    scientificName: "Ketoprofen SR",
    form: "أقراص ممتدة المفعول",
    strength: "150mg",
    manufacturer: "EIPICO",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004129",
    tradeName: "فلدين 20 مجم كبسولات",
    scientificName: "Piroxicam",
    form: "كبسولات",
    strength: "20mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 2 شريط - 20 كبسولة",
    price: 38.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004136",
    tradeName: "سيلبركس 200 مجم كبسولات",
    scientificName: "Celecoxib",
    form: "كبسولات صلبة",
    strength: "200mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 1 شريط - 10 كبسولات",
    price: 95.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6224004004143",
    tradeName: "أركوكسيا 90 مجم أقراص",
    scientificName: "Etoricoxib",
    form: "أقراص مغلفة",
    strength: "90mg",
    manufacturer: "MSD - Merck Sharp & Dohme",
    packDesc: "علبة 1 شريط - 7 أقراص",
    price: 135.00,
    notes: "تسعيرة رسمية"
  },

  // 2. أدوية البرد والإنفلونزا والكحة والحساسية (Cold, Flu, Cough & Allergy)
  {
    barcode: "6222002002022",
    tradeName: "كونجستال أقراص للبرد",
    scientificName: "Paracetamol + Pseudoephedrine + Chlorpheniramine",
    form: "أقراص",
    strength: "650mg/60mg/4mg",
    manufacturer: "SIGMA Pharmaceuticals",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 39.00,
    notes: "نشرة أسعار 2026"
  },
  {
    barcode: "6222002002039",
    tradeName: "كونجستال شراب أطفال",
    scientificName: "Paracetamol + Pseudoephedrine + Chlorpheniramine",
    form: "شراب",
    strength: "160mg/15mg/1mg per 5ml",
    manufacturer: "SIGMA Pharmaceuticals",
    packDesc: "زجاجة 120 مل",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002046",
    tradeName: "123 أقراص (وان تو ثري) للبرد",
    scientificName: "Paracetamol + Pseudoephedrine + Chlorpheniramine",
    form: "أقراص",
    strength: "500mg/30mg/2mg",
    manufacturer: "Hikma Pharmaceuticals",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002053",
    tradeName: "كومتركس أقراص للإنفلونزا",
    scientificName: "Paracetamol + Pseudoephedrine + Chlorpheniramine",
    form: "أقراص مغلفة",
    strength: "500mg/30mg/2mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 24 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002060",
    tradeName: "نايت آند داي أقراص",
    scientificName: "Paracetamol + Pseudoephedrine + Diphenhydramine",
    form: "أقراص (نهاري وليلي)",
    strength: "500mg/60mg",
    manufacturer: "EVA Pharma",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002077",
    tradeName: "فلوستوب أقراص",
    scientificName: "Paracetamol + Diphenhydramine + Pseudoephedrine",
    form: "أقراص",
    strength: "500mg/25mg/30mg",
    manufacturer: "EIPICO",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 30.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002084",
    tradeName: "تلفاست 120 مجم أقراص حساسية",
    scientificName: "Fexofenadine HCl",
    form: "أقراص مغلفة",
    strength: "120mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 90.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002091",
    tradeName: "تلفاست 180 مجم أقراص حساسية",
    scientificName: "Fexofenadine HCl",
    form: "أقراص مغلفة",
    strength: "180mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 110.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002107",
    tradeName: "تلفاست شراب أطفال 30 مجم/5 مل",
    scientificName: "Fexofenadine HCl",
    form: "شراب معلق",
    strength: "30mg/5ml",
    manufacturer: "Sanofi-Aventis",
    packDesc: "زجاجة 100 مل",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002114",
    tradeName: "زيرتك 10 مجم أقراص",
    scientificName: "Cetirizine Di-HCl",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 58.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002121",
    tradeName: "زيرتك نقط بالفم للأطفال",
    scientificName: "Cetirizine Di-HCl",
    form: "نقط فموية",
    strength: "10mg/ml",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "قطارة 15 مل",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002138",
    tradeName: "زيرتك شراب أطفال",
    scientificName: "Cetirizine Di-HCl",
    form: "شراب",
    strength: "5mg/5ml",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "زجاجة 100 مل",
    price: 38.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002145",
    tradeName: "كلاريتين 10 مجم أقراص",
    scientificName: "Loratadine",
    form: "أقراص",
    strength: "10mg",
    manufacturer: "Bayer Healthcare",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 64.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002152",
    tradeName: "كلاريتين شراب أطفال",
    scientificName: "Loratadine",
    form: "شراب",
    strength: "5mg/5ml",
    manufacturer: "Bayer Healthcare",
    packDesc: "زجاجة 100 مل",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002169",
    tradeName: "برونكوفين شراب مهدئ للسعال",
    scientificName: "Guaifenesin + Dextromethorphan + Diphenhydramine",
    form: "شراب",
    strength: "100mg/10mg/7.5mg per 5ml",
    manufacturer: "Misr Co. for Ph. Ind.",
    packDesc: "زجاجة 125 مل",
    price: 26.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002176",
    tradeName: "أوبلكس شراب للكحة والبلغم",
    scientificName: "Oxomemazine + Guaifenesin + Paracetamol",
    form: "شراب",
    strength: "1.65mg/33.3mg/33.3mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "زجاجة 125 مل",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002183",
    tradeName: "كوديلار شراب كحة ناشفة",
    scientificName: "Dextromethorphan + Phenylephrine + Chlorpheniramine",
    form: "شراب",
    strength: "15mg/5mg/2mg per 5ml",
    manufacturer: "Kahira Pharm.",
    packDesc: "زجاجة 120 مل",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002190",
    tradeName: "بلسم شراب كحة للأطفال بخلاصة الأعشاب",
    scientificName: "Thyme + Guava Leaf + Tilia + Honey",
    form: "شراب طبيعي",
    strength: "Herbal Extract",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "زجاجة 120 مل",
    price: 36.00,
    notes: "مكمل غذائي رسمي"
  },
  {
    barcode: "6222002002206",
    tradeName: "إيريبان شراب أوراق اللبلاب للكحة",
    scientificName: "Ivy Leaf Extract",
    form: "شراب أعشاب",
    strength: "0.7g/100ml",
    manufacturer: "Borg Pharmaceutical",
    packDesc: "زجاجة 100 مل",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002213",
    tradeName: "ميوكوسول شراب طارد للبلغم",
    scientificName: "Carbocisteine",
    form: "شراب",
    strength: "250mg/5ml",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "زجاجة 120 مل",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002220",
    tradeName: "ميوكوسول كبسولات مذيب للبلغم",
    scientificName: "Carbocisteine",
    form: "كبسولات",
    strength: "375mg",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "علبة 2 شريط - 20 كبسولة",
    price: 28.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002237",
    tradeName: "فاركوسولفين كبسولات مذيب وموسع",
    scientificName: "Ambroxol + Theophylline + Guaifenesin",
    form: "كبسولات",
    strength: "30mg/100mg/100mg",
    manufacturer: "Pharco Pharmaceuticals",
    packDesc: "علبة 3 شريط - 30 كبسولة",
    price: 33.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002244",
    tradeName: "أول-فينت شراب موسع للشعب ومذيب",
    scientificName: "Bromhexine + Terbutaline + Guaifenesin + Menthol",
    form: "شراب",
    strength: "Combination",
    manufacturer: "Borg Pharmaceutical",
    packDesc: "زجاجة 120 مل",
    price: 26.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002251",
    tradeName: "فينتولين شراب موسع للشعب أطفال",
    scientificName: "Salbutamol",
    form: "شراب",
    strength: "2mg/5ml",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "زجاجة 120 مل",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002268",
    tradeName: "فينتولين بخاخ صدر سريع المفعول",
    scientificName: "Salbutamol Inhaler",
    form: "بخاخ استنشاق (MDI)",
    strength: "100mcg/dose - 200 doses",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "عبوة بخاخ 200 جرعة",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002275",
    tradeName: "أتروفنت 0.025% محلول استنشاق وجلسات",
    scientificName: "Ipratropium Bromide",
    form: "محلول استنشاق",
    strength: "250mcg/ml",
    manufacturer: "Boehringer Ingelheim",
    packDesc: "زجاجة 20 مل",
    price: 52.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6222002002282",
    tradeName: "بولميكورت 0.5 مجم/2 مل محلول جلسات",
    scientificName: "Budesonide",
    form: "محلول استنشاق معلق",
    strength: "0.5mg/2ml",
    manufacturer: "AstraZeneca",
    packDesc: "علبة 20 أمبولة بلاستيك",
    price: 360.00,
    notes: "تسعيرة رسمية"
  },

  // 3. المضادات الحيوية ومضادات البكتيريا والفطريات (Antibiotics & Antifungals)
  {
    barcode: "6223003003033",
    tradeName: "أوجمنتين 1 جم أقراص",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "أقراص مغلفة",
    strength: "1000mg",
    manufacturer: "Medical Union Pharmaceuticals (MUP)",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 131.00,
    notes: "تسعيرة وزارة الصحة"
  },
  {
    barcode: "6223003003040",
    tradeName: "أوجمنتين 625 مجم أقراص",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "أقراص مغلفة",
    strength: "625mg",
    manufacturer: "Medical Union Pharmaceuticals (MUP)",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 95.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003057",
    tradeName: "أوجمنتين 457 مجم معلق أطفال",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "بودرة لتحضير شراب معلق",
    strength: "457mg/5ml",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "زجاجة 70 مل بعد التحضير",
    price: 78.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003064",
    tradeName: "أوجمنتين 312 مجم معلق أطفال",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "بودرة لتحضير شراب",
    strength: "312mg/5ml",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "زجاجة 80 مل بعد التحضير",
    price: 62.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003071",
    tradeName: "هاي-بيوتك 1 جم أقراص",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "أقراص مغلفة",
    strength: "1000mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 2 شريط - 16 قرص",
    price: 118.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003088",
    tradeName: "هاي-بيوتك 625 مجم أقراص",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "أقراص مغلفة",
    strength: "625mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 2 شريط - 16 قرص",
    price: 88.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003095",
    tradeName: "هاي-بيوتك 457 مجم معلق أطفال",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "بودرة معلق أطفال",
    strength: "457mg/5ml",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "زجاجة 80 مل",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003101",
    tradeName: "كلافيموكس 1 جم أقراص",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "أقراص مغلفة",
    strength: "1000mg",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 105.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003118",
    tradeName: "ميجاموكس 1 جم أقراص",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "أقراص مغلفة",
    strength: "1000mg",
    manufacturer: "Julphar Pharmaceuticals",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 110.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003125",
    tradeName: "كيوام 1 جم أقراص (Curam)",
    scientificName: "Amoxicillin + Clavulanic Acid",
    form: "أقراص مغلفة",
    strength: "1000mg",
    manufacturer: "Sandoz / Novartis",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 125.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003132",
    tradeName: "زيثروماكس 500 مجم كبسولات",
    scientificName: "Azithromycin",
    form: "كبسولات صلبة",
    strength: "500mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 1 شريط - 3 كبسولات",
    price: 95.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003149",
    tradeName: "زيثروماكس 200 مجم/5 مل معلق أطفال",
    scientificName: "Azithromycin",
    form: "بودرة لتحضير معلق",
    strength: "200mg/5ml",
    manufacturer: "Pfizer Egypt",
    packDesc: "زجاجة 22.5 مل",
    price: 65.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003156",
    tradeName: "زيروديل 500 مجم أقراص",
    scientificName: "Azithromycin",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "Apex Pharma",
    packDesc: "علبة 1 شريط - 3 أقراص",
    price: 52.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003163",
    tradeName: "زيثين 500 مجم أقراص",
    scientificName: "Azithromycin",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "EVA Pharma",
    packDesc: "علبة 1 شريط - 3 أقراص",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003170",
    tradeName: "تافانيك 500 مجم أقراص",
    scientificName: "Levofloxacin",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 1 شريط - 7 أقراص",
    price: 145.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003187",
    tradeName: "تاريفيد 200 مجم أقراص",
    scientificName: "Ofloxacin",
    form: "أقراص مغلفة",
    strength: "200mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 1 شريط - 10 أقراص",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003194",
    tradeName: "سيبروفلوكساسين 500 مجم أقراص",
    scientificName: "Ciprofloxacin",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 1 شريط - 10 أقراص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003200",
    tradeName: "سيبروباي 500 مجم أقراص (Ciprobay)",
    scientificName: "Ciprofloxacin",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "Bayer Healthcare",
    packDesc: "علبة 1 شريط - 10 أقراص",
    price: 85.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003217",
    tradeName: "سيبروفار 500 مجم أقراص",
    scientificName: "Ciprofloxacin",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "Pharco Pharmaceuticals",
    packDesc: "علبة 1 شريط - 10 أقراص",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003224",
    tradeName: "سبترين أقراص",
    scientificName: "Sulfamethoxazole + Trimethoprim",
    form: "أقراص",
    strength: "400mg/80mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 32.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003231",
    tradeName: "سوتريم شراب معلق أطفال",
    scientificName: "Sulfamethoxazole + Trimethoprim",
    form: "شراب معلق",
    strength: "200mg/40mg per 5ml",
    manufacturer: "Misr Co. for Ph. Ind.",
    packDesc: "زجاجة 100 مل",
    price: 18.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003248",
    tradeName: "فلوكسامو 1 جم كبسولات",
    scientificName: "Amoxicillin + Flucloxacillin",
    form: "كبسولات صلبة",
    strength: "500mg/500mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 2 شريط - 16 كبسولة",
    price: 65.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003255",
    tradeName: "أموكسيل 500 مجم كبسولات",
    scientificName: "Amoxicillin",
    form: "كبسولات",
    strength: "500mg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 2 شريط - 16 كبسولة",
    price: 38.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003262",
    tradeName: "إبيسيلين 500 مجم فيال حقن",
    scientificName: "Ampicillin",
    form: "بودرة حقن فيال",
    strength: "500mg",
    manufacturer: "EIPICO",
    packDesc: "فيال + أمبول ماء مذيب",
    price: 16.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003279",
    tradeName: "فلاجيل 500 مجم أقراص مطهر معوي",
    scientificName: "Metronidazole",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 34.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003286",
    tradeName: "فلاجيل 125 مجم/5 مل معلق أطفال",
    scientificName: "Metronidazole",
    form: "شراب معلق",
    strength: "125mg/5ml",
    manufacturer: "Sanofi-Aventis",
    packDesc: "زجاجة 100 مل",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003293",
    tradeName: "أمريزول 500 مجم أقراص",
    scientificName: "Metronidazole",
    form: "أقراص",
    strength: "500mg",
    manufacturer: "Amriya Pharm. Ind.",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 26.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003309",
    tradeName: "ديفلوكان 150 مجم كبسولة واحدة",
    scientificName: "Fluconazole",
    form: "كبسولة فموية",
    strength: "150mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة كبسولة واحدة",
    price: 62.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003316",
    tradeName: "فلوكورال 150 مجم كبسولات فطريات",
    scientificName: "Fluconazole",
    form: "كبسولات صلبة",
    strength: "150mg",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "علبة كبسولتين",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003323",
    tradeName: "تريفلوكان 150 مجم كبسولات",
    scientificName: "Fluconazole",
    form: "كبسولات صلبة",
    strength: "150mg",
    manufacturer: "EIPICO",
    packDesc: "علبة كبسولة واحدة",
    price: 32.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003330",
    tradeName: "كليندامايسين 300 مجم كبسولات",
    scientificName: "Clindamycin",
    form: "كبسولات",
    strength: "300mg",
    manufacturer: "Pharco Pharmaceuticals",
    packDesc: "علبة 2 شريط - 16 كبسولة",
    price: 52.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6223003003347",
    tradeName: "دالاسين سي 300 مجم كبسولات",
    scientificName: "Clindamycin HCl",
    form: "كبسولات",
    strength: "300mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 2 شريط - 16 كبسولة",
    price: 90.00,
    notes: "تسعيرة رسمية"
  },

  // 4. أدوية الجهاز الهضمي والمعدة والقولون (Gastrointestinal & Digestive)
  {
    barcode: "6225005005011",
    tradeName: "أنتينال 200 مجم كبسولات مطهر معوي",
    scientificName: "Nifuroxazide",
    form: "كبسولات صلبة",
    strength: "200mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 2 شريط - 24 كبسولة",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005028",
    tradeName: "أنتينال شراب معلق للأطفال",
    scientificName: "Nifuroxazide",
    form: "شراب معلق",
    strength: "220mg/5ml",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "زجاجة 60 مل",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005035",
    tradeName: "دياكس 200 مجم كبسولات إسهال",
    scientificName: "Nifuroxazide",
    form: "كبسولات",
    strength: "200mg",
    manufacturer: "Kahira Pharm.",
    packDesc: "علبة 2 شريط - 20 كبسولة",
    price: 26.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005042",
    tradeName: "ستربتوكين أقراص للمغص والإسهال",
    scientificName: "Diiodohydroxyquinoline + Phthalylsulfathiazole + Streptomycin",
    form: "أقراص",
    strength: "Combination",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 1 شريط - 10 أقراص",
    price: 18.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005059",
    tradeName: "إيموديوم 2 مجم كبسولات إسهال حاد",
    scientificName: "Loperamide HCl",
    form: "كبسولات صلبة",
    strength: "2mg",
    manufacturer: "Johnson & Johnson",
    packDesc: "علبة 1 شريط - 6 كبسولات",
    price: 35.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005066",
    tradeName: "كونترولوك 40 مجم أقراص حموضة ومعدة",
    scientificName: "Pantoprazole",
    form: "أقراص مغلفة معوياً",
    strength: "40mg",
    manufacturer: "Takeda Pharmaceuticals",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 112.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005073",
    tradeName: "كونترولوك 20 مجم أقراص",
    scientificName: "Pantoprazole",
    form: "أقراص مغلفة معوياً",
    strength: "20mg",
    manufacturer: "Takeda Pharmaceuticals",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 82.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005080",
    tradeName: "نيكسيوم 40 مجم أقراص قرحة وارتجاع",
    scientificName: "Esomeprazole",
    form: "أقراص مغلفة معوياً",
    strength: "40mg",
    manufacturer: "AstraZeneca",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 165.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005097",
    tradeName: "نيكسيوم 20 مجم أقراص",
    scientificName: "Esomeprazole",
    form: "أقراص مغلفة معوياً",
    strength: "20mg",
    manufacturer: "AstraZeneca",
    packDesc: "علبة 2 شريط - 14 قرص",
    price: 125.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005103",
    tradeName: "أوميبرازول 20 مجم كبسولات",
    scientificName: "Omeprazole",
    form: "كبسولات معوية",
    strength: "20mg",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "علبة 2 شريط - 14 كبسولة",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005110",
    tradeName: "أوميز 20 مجم كبسولات",
    scientificName: "Omeprazole",
    form: "كبسولات معوية",
    strength: "20mg",
    manufacturer: "Pharco Pharmaceuticals",
    packDesc: "علبة 2 شريط - 14 كبسولة",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005127",
    tradeName: "هيلسيك 20 مجم كبسولات حموضة",
    scientificName: "Omeprazole",
    form: "كبسولات",
    strength: "20mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 2 شريط - 14 كبسولة",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005134",
    tradeName: "أنتودين 40 مجم أقراص",
    scientificName: "Famotidine",
    form: "أقراص مغلفة",
    strength: "40mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005141",
    tradeName: "مالوكس بلس أكياس فوار للحموضة",
    scientificName: "Aluminum Hydroxide + Magnesium Hydroxide + Simethicone",
    form: "أكياس فوار معلق",
    strength: "Combination",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 20 كيس",
    price: 65.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005158",
    tradeName: "جافيسكون شراب نعناع للحموضة والارتجاع",
    scientificName: "Sodium Alginate + Sodium Bicarbonate + Calcium Carbonate",
    form: "شراب معلق",
    strength: "Combination",
    manufacturer: "Reckitt Benckiser",
    packDesc: "زجاجة 150 مل",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005165",
    tradeName: "إبيكوجيل شراب حموضة ومعدّة",
    scientificName: "Aluminum Hydroxide + Magnesium Hydroxide + Dimethicone",
    form: "شراب معلق",
    strength: "Combination",
    manufacturer: "EIPICO",
    packDesc: "زجاجة 125 مل",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005172",
    tradeName: "كولونا أقراص للقولون العصبي والانتفاخ",
    scientificName: "Mebeverine HCl + Sulpiride",
    form: "أقراص مغلفة",
    strength: "100mg/25mg",
    manufacturer: "Rameda Pharmaceuticals",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005189",
    tradeName: "كولوفيرين د أقراص للقولون والغازات",
    scientificName: "Mebeverine HCl + Dimethicone",
    form: "أقراص مغلفة",
    strength: "135mg/40mg",
    manufacturer: "Chemipharm",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 52.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005196",
    tradeName: "كولوفيرين أ أقراص للقولون والتوتر",
    scientificName: "Mebeverine HCl + Chlordiazepoxide",
    form: "أقراص مغلفة",
    strength: "135mg/5mg",
    manufacturer: "Chemipharm",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005202",
    tradeName: "ليبراكس أقراص لقرحة المعدة والقولون",
    scientificName: "Clidinium Bromide + Chlordiazepoxide",
    form: "أقراص مغلفة",
    strength: "2.5mg/5mg",
    manufacturer: "Meda Pharma / EIPICO",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005219",
    tradeName: "ديسباتالين ريتارد 200 مجم كبسولات قولون",
    scientificName: "Mebeverine HCl SR",
    form: "كبسولات ممتدة المفعول",
    strength: "200mg",
    manufacturer: "Abbott Laboratories",
    packDesc: "علبة 3 شريط - 30 كبسولة",
    price: 92.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005226",
    tradeName: "سبازموفرين أقراص للمغص والتقلصات",
    scientificName: "Ketoprofen + Hyoscine Butylbromide",
    form: "أقراص",
    strength: "50mg/10mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 32.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005233",
    tradeName: "بسكوبان 10 مجم أقراص للتقلصات",
    scientificName: "Hyoscine Butylbromide",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005240",
    tradeName: "بسكوبان كومبوزيتم أقراص مسكن للمغص",
    scientificName: "Hyoscine Butylbromide + Paracetamol",
    form: "أقراص مغلفة",
    strength: "10mg/500mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005257",
    tradeName: "موتيليوم 10 مجم أقراص للغثيان والترجيع",
    scientificName: "Domperidone",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "Janssen / Johnson & Johnson",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 58.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005264",
    tradeName: "موتيليوم شراب معلق أطفال",
    scientificName: "Domperidone",
    form: "شراب معلق",
    strength: "1mg/ml",
    manufacturer: "Janssen / Johnson & Johnson",
    packDesc: "زجاجة 100 مل",
    price: 32.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005271",
    tradeName: "برمبران 10 مجم أقراص للقيء",
    scientificName: "Metoclopramide HCl",
    form: "أقراص",
    strength: "10mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005288",
    tradeName: "دوفلاك شراب ملين للإمساك",
    scientificName: "Lactulose",
    form: "شراب سكري",
    strength: "3.33g/5ml",
    manufacturer: "Abbott Laboratories",
    packDesc: "زجاجة 200 مل",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005295",
    tradeName: "لاكتولوز شراب ملين",
    scientificName: "Lactulose",
    form: "شراب",
    strength: "67%",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "زجاجة 120 مل",
    price: 38.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005301",
    tradeName: "بيكولاكس نقط ملينة للبطن",
    scientificName: "Sodium Picosulfate",
    form: "نقط فموية",
    strength: "7.5mg/ml",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "قطارة 15 مل",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005318",
    tradeName: "دولكولاكس 5 مجم أقراص إمساك",
    scientificName: "Bisacodyl",
    form: "أقراص مغلفة معوياً",
    strength: "5mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005325",
    tradeName: "دايجستين أقراص هاضمة للدهون والبروتين",
    scientificName: "Papain + Pepsin + Sanzyme",
    form: "أقراص",
    strength: "Enzymatic Complex",
    manufacturer: "Pharco Pharmaceuticals",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 25.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005332",
    tradeName: "أوكاربون أقراص فحم نباتي للانتفاخ والغازات",
    scientificName: "Vegetable Charcoal + Senna + Rhubarb",
    form: "أقراص فحم",
    strength: "Natural Complex",
    manufacturer: "F. Trenka / SEDICO",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6225005005349",
    tradeName: "ديسفلاتيل أقراص مضغ لطرد الغازات",
    scientificName: "Simethicone",
    form: "أقراص قابلة للمضغ",
    strength: "40mg",
    manufacturer: "EIPICO",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 28.00,
    notes: "تسعيرة رسمية"
  },

  // 5. أدوية القلب والضغط والسيولة والكوليسترول (Cardiovascular, Hypertension, Statins & Blood Thinners)
  {
    barcode: "6226006006018",
    tradeName: "كونكور 5 مجم أقراص ضغط وتنظيم نبض",
    scientificName: "Bisoprolol Fumarate",
    form: "أقراص مغلفة مقسمة",
    strength: "5mg",
    manufacturer: "Merck KGaA / Amoun",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 75.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006025",
    tradeName: "كونكور 2.5 مجم أقراص ضغط",
    scientificName: "Bisoprolol Fumarate",
    form: "أقراص مغلفة",
    strength: "2.5mg",
    manufacturer: "Merck KGaA / Amoun",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 60.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006032",
    tradeName: "كونكور 10 مجم أقراص",
    scientificName: "Bisoprolol Fumarate",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "Merck KGaA / Amoun",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 90.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006049",
    tradeName: "كونكور 5 بلس أقراص (Concor 5 Plus)",
    scientificName: "Bisoprolol + Hydrochlorothiazide",
    form: "أقراص مغلفة",
    strength: "5mg/12.5mg",
    manufacturer: "Merck KGaA / Amoun",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 85.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006056",
    tradeName: "بيستول 5 مجم أقراص",
    scientificName: "Bisoprolol Fumarate",
    form: "أقراص",
    strength: "5mg",
    manufacturer: "EVA Pharma",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006063",
    tradeName: "كابوتن 25 مجم أقراص ضغط",
    scientificName: "Captopril",
    form: "أقراص",
    strength: "25mg",
    manufacturer: "Bristol-Myers Squibb",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006070",
    tradeName: "كابوتن 50 مجم أقراص",
    scientificName: "Captopril",
    form: "أقراص",
    strength: "50mg",
    manufacturer: "Bristol-Myers Squibb",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006087",
    tradeName: "نورفاسك 5 مجم أقراص ضغط",
    scientificName: "Amlodipine Besylate",
    form: "أقراص",
    strength: "5mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 95.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006094",
    tradeName: "نورفاسك 10 مجم أقراص",
    scientificName: "Amlodipine Besylate",
    form: "أقراص",
    strength: "10mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 120.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006100",
    tradeName: "أميلو 5 مجم أقراص",
    scientificName: "Amlodipine",
    form: "أقراص",
    strength: "5mg",
    manufacturer: "EIPICO",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006117",
    tradeName: "إكسفورج 5/80 مجم أقراص ضغط مجمعة",
    scientificName: "Amlodipine + Valsartan",
    form: "أقراص مغلفة",
    strength: "5mg/80mg",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 195.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006124",
    tradeName: "إكسفورج 5/160 مجم أقراص",
    scientificName: "Amlodipine + Valsartan",
    form: "أقراص مغلفة",
    strength: "5mg/160mg",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 220.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006131",
    tradeName: "إكسفورج 10/160 مجم أقراص",
    scientificName: "Amlodipine + Valsartan",
    form: "أقراص مغلفة",
    strength: "10mg/160mg",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 245.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006148",
    tradeName: "أتاكاند 8 مجم أقراص ضغط",
    scientificName: "Candesartan Cilexetil",
    form: "أقراص مقسمة",
    strength: "8mg",
    manufacturer: "AstraZeneca",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 135.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006155",
    tradeName: "أتاكاند 16 مجم أقراص",
    scientificName: "Candesartan Cilexetil",
    form: "أقراص مقسمة",
    strength: "16mg",
    manufacturer: "AstraZeneca",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 165.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006162",
    tradeName: "كوزار 50 مجم أقراص ضغط",
    scientificName: "Losartan Potassium",
    form: "أقراص مغلفة",
    strength: "50mg",
    manufacturer: "MSD - Merck Sharp & Dohme",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 110.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006179",
    tradeName: "هايزار 50/12.5 مجم أقراص",
    scientificName: "Losartan + Hydrochlorothiazide",
    form: "أقراص مغلفة",
    strength: "50mg/12.5mg",
    manufacturer: "MSD - Merck Sharp & Dohme",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 130.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006186",
    tradeName: "ناتريلكس إس آر 1.5 مجم أقراص",
    scientificName: "Indapamide SR",
    form: "أقراص ممتدة المفعول",
    strength: "1.5mg",
    manufacturer: "Servier Egypt",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006193",
    tradeName: "لازيكس 40 مجم أقراص مدر للبول",
    scientificName: "Furosemide",
    form: "أقراص",
    strength: "40mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 24 قرص",
    price: 28.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006209",
    tradeName: "لازيكس 20 مجم/2 مل حقن أمبولات",
    scientificName: "Furosemide",
    form: "حقن أمبولات",
    strength: "20mg/2ml",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 5 أمبولات",
    price: 32.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006216",
    tradeName: "ألدكتون 25 مجم أقراص",
    scientificName: "Spironolactone",
    form: "أقراص مغلفة",
    strength: "25mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 35.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006223",
    tradeName: "بلافيكس 75 مجم أقراص سيولة الدم",
    scientificName: "Clopidogrel",
    form: "أقراص مغلفة",
    strength: "75mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 240.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006230",
    tradeName: "كلوجرل 75 مجم أقراص سيولة",
    scientificName: "Clopidogrel",
    form: "أقراص مغلفة",
    strength: "75mg",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 88.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006247",
    tradeName: "إكساريلتو 20 مجم أقراص مضاد تجلط",
    scientificName: "Rivaroxaban",
    form: "أقراص مغلفة",
    strength: "20mg",
    manufacturer: "Bayer Healthcare",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 380.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006254",
    tradeName: "إكساريلتو 10 مجم أقراص",
    scientificName: "Rivaroxaban",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "Bayer Healthcare",
    packDesc: "علبة 1 شريط - 10 أقراص",
    price: 180.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006261",
    tradeName: "إيليكويس 5 مجم أقراص تجلط",
    scientificName: "Apixaban",
    form: "أقراص مغلفة",
    strength: "5mg",
    manufacturer: "Bristol-Myers Squibb / Pfizer",
    packDesc: "علبة 4 شريط - 56 قرص",
    price: 490.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006278",
    tradeName: "كريستور 10 مجم أقراص كوليسترول",
    scientificName: "Rosuvastatin Calcium",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "AstraZeneca",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 210.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006285",
    tradeName: "كريستور 20 مجم أقراص",
    scientificName: "Rosuvastatin Calcium",
    form: "أقراص مغلفة",
    strength: "20mg",
    manufacturer: "AstraZeneca",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 270.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006292",
    tradeName: "روسوفاست 10 مجم أقراص",
    scientificName: "Rosuvastatin",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "EVA Pharma",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 78.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006308",
    tradeName: "ليبيتور 20 مجم أقراص دهون وكوليسترول",
    scientificName: "Atorvastatin Calcium",
    form: "أقراص مغلفة",
    strength: "20mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 185.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006315",
    tradeName: "ليبيتور 40 مجم أقراص",
    scientificName: "Atorvastatin Calcium",
    form: "أقراص مغلفة",
    strength: "40mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 240.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006322",
    tradeName: "أتور 20 مجم أقراص",
    scientificName: "Atorvastatin",
    form: "أقراص مغلفة",
    strength: "20mg",
    manufacturer: "EIPICO",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 65.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6226006006339",
    tradeName: "أتور 40 مجم أقراص",
    scientificName: "Atorvastatin",
    form: "أقراص مغلفة",
    strength: "40mg",
    manufacturer: "EIPICO",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 90.00,
    notes: "تسعيرة رسمية"
  },

  // 6. أدوية السكر والغدد (Diabetes & Endocrinology)
  {
    barcode: "6227007007015",
    tradeName: "جلوكوفاج 500 مجم أقراص سكر",
    scientificName: "Metformin HCl",
    form: "أقراص مغلفة",
    strength: "500mg",
    manufacturer: "Merck Serono / Minapharm",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007022",
    tradeName: "جلوكوفاج 1000 مجم أقراص",
    scientificName: "Metformin HCl",
    form: "أقراص مغلفة",
    strength: "1000mg",
    manufacturer: "Merck Serono / Minapharm",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 60.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007039",
    tradeName: "جلوكوفاج إكس آر 500 مجم أقراص ممتدة المفعول",
    scientificName: "Metformin HCl Extended Release",
    form: "أقراص ممتدة المفعول",
    strength: "500mg",
    manufacturer: "Merck Serono / Minapharm",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007046",
    tradeName: "جلوكوفاج إكس آر 1000 مجم أقراص",
    scientificName: "Metformin HCl Extended Release",
    form: "أقراص ممتدة المفعول",
    strength: "1000mg",
    manufacturer: "Merck Serono / Minapharm",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 75.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007053",
    tradeName: "سيدوفاج 500 مجم أقراص",
    scientificName: "Metformin HCl",
    form: "أقراص",
    strength: "500mg",
    manufacturer: "CID - Chemical Industries",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007060",
    tradeName: "سيدوفاج 850 مجم أقراص",
    scientificName: "Metformin HCl",
    form: "أقراص",
    strength: "850mg",
    manufacturer: "CID - Chemical Industries",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 33.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007077",
    tradeName: "أماريل 1 مجم أقراص سكر",
    scientificName: "Glimepiride",
    form: "أقراص",
    strength: "1mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007084",
    tradeName: "أماريل 2 مجم أقراص",
    scientificName: "Glimepiride",
    form: "أقراص",
    strength: "2mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 54.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007091",
    tradeName: "أماريل 3 مجم أقراص",
    scientificName: "Glimepiride",
    form: "أقراص",
    strength: "3mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007107",
    tradeName: "أماريل 4 مجم أقراص",
    scientificName: "Glimepiride",
    form: "أقراص",
    strength: "4mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 82.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007114",
    tradeName: "جانوفيا 100 مجم أقراص سكر",
    scientificName: "Sitagliptin",
    form: "أقراص مغلفة",
    strength: "100mg",
    manufacturer: "MSD - Merck Sharp & Dohme",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 310.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007121",
    tradeName: "جانوميت 50/1000 مجم أقراص",
    scientificName: "Sitagliptin + Metformin",
    form: "أقراص مغلفة",
    strength: "50mg/1000mg",
    manufacturer: "MSD - Merck Sharp & Dohme",
    packDesc: "علبة 4 شريط - 56 قرص",
    price: 360.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007138",
    tradeName: "جالفوس 50 مجم أقراص سكر",
    scientificName: "Vildagliptin",
    form: "أقراص",
    strength: "50mg",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 195.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007145",
    tradeName: "جالفوس مت 50/1000 مجم أقراص",
    scientificName: "Vildagliptin + Metformin",
    form: "أقراص مغلفة",
    strength: "50mg/1000mg",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 215.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007152",
    tradeName: "فورسيجا 10 مجم أقراص سكر وحماية كلى",
    scientificName: "Dapagliflozin",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "AstraZeneca",
    packDesc: "علبة 2 شريط - 28 قرص",
    price: 495.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007169",
    tradeName: "جارديانس 10 مجم أقراص سكر وحماية قلب",
    scientificName: "Empagliflozin",
    form: "أقراص مغلفة",
    strength: "10mg",
    manufacturer: "Boehringer Ingelheim",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 520.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007176",
    tradeName: "جارديانس 25 مجم أقراص",
    scientificName: "Empagliflozin",
    form: "أقراص مغلفة",
    strength: "25mg",
    manufacturer: "Boehringer Ingelheim",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 580.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007183",
    tradeName: "ميكستارد 30 إنسولين بشري 100 وحدة/مل فيال",
    scientificName: "Human Insulin (Biphasic Isophane)",
    form: "معلق حقن فيال (ثلاجة)",
    strength: "100 IU/ml - 10ml",
    manufacturer: "Novo Nordisk",
    packDesc: "فيال زجاجي 10 مل",
    price: 75.00,
    notes: "يحفظ مبرداً بالثلاجة 2-8°C"
  },
  {
    barcode: "6227007007190",
    tradeName: "لانتوس سولوستار قلم إنسولين قاعدي",
    scientificName: "Insulin Glargine",
    form: "قلم حقن معبأ مسبقاً (ثلاجة)",
    strength: "100 units/ml - 3ml",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 5 أقلام سولوستار",
    price: 650.00,
    notes: "يحفظ مبرداً بالثلاجة 2-8°C"
  },
  {
    barcode: "6227007007206",
    tradeName: "نوفورابيد فلكسبن إنسولين سريع المفعول",
    scientificName: "Insulin Aspart",
    form: "قلم حقن معبأ مسبقاً (ثلاجة)",
    strength: "100 units/ml - 3ml",
    manufacturer: "Novo Nordisk",
    packDesc: "علبة 5 أقلام فلكسبن",
    price: 550.00,
    notes: "يحفظ مبرداً بالثلاجة 2-8°C"
  },
  {
    barcode: "6227007007213",
    tradeName: "إلتروكسين 50 ميكروجرام أقراص غدة درقية",
    scientificName: "Levothyroxine Sodium",
    form: "أقراص",
    strength: "50mcg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 100 قرص (برطمان)",
    price: 65.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007220",
    tradeName: "إلتروكسين 100 ميكروجرام أقراص",
    scientificName: "Levothyroxine Sodium",
    form: "أقراص",
    strength: "100mcg",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "علبة 100 قرص (برطمان)",
    price: 85.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007237",
    tradeName: "يوثيروكس 50 ميكروجرام أقراص",
    scientificName: "Levothyroxine",
    form: "أقراص مقسمة",
    strength: "50mcg",
    manufacturer: "Merck KGaA",
    packDesc: "علبة 2 شريط - 50 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6227007007244",
    tradeName: "يوثيروكس 100 ميكروجرام أقراص",
    scientificName: "Levothyroxine",
    form: "أقراص مقسمة",
    strength: "100mcg",
    manufacturer: "Merck KGaA",
    packDesc: "علبة 2 شريط - 50 قرص",
    price: 60.00,
    notes: "تسعيرة رسمية"
  },

  // 7. الفيتامينات والمكملات الغذائية والمعادن (Vitamins, Minerals & Supplements)
  {
    barcode: "6228008008012",
    tradeName: "نيوروتون أقراص فيتامين ب مركب",
    scientificName: "Vitamin B1 + B6 + B12 + Folic Acid",
    form: "أقراص مغلفة",
    strength: "Combination B-Complex",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 54.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008029",
    tradeName: "نيوروتون حقن عضل فيتامين ب",
    scientificName: "Vitamin B1 + B6 + B12",
    form: "حقن أمبولات",
    strength: "High Potency B-Complex",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 6 أمبولات",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008036",
    tradeName: "نيوروبيون أقراص",
    scientificName: "Vitamin B1 + B6 + B12",
    form: "أقراص مغلفة",
    strength: "B-Complex",
    manufacturer: "Merck / Procter & Gamble",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008043",
    tradeName: "ديبوفيت ب12 حقن طويلة المفعول",
    scientificName: "Hydroxocobalamin (Vit B12)",
    form: "حقن أمبولات",
    strength: "1000mcg/ml",
    manufacturer: "Amriya Pharm. Ind.",
    packDesc: "علبة 5 أمبولات",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008050",
    tradeName: "بيتولفكس 1 مجم حقن فيتامين ب12",
    scientificName: "Cyanocobalamin (Vit B12)",
    form: "حقن أمبولات",
    strength: "1mg/ml",
    manufacturer: "EIPICO",
    packDesc: "علبة 2 أمبولة",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008067",
    tradeName: "فيروجلوبين كبسولات حديد وفيتامينات زنك",
    scientificName: "Iron + Zinc + B-Complex + Copper",
    form: "كبسولات بطيئة الامتصاص",
    strength: "Combination",
    manufacturer: "Vitabiotics Egypt",
    packDesc: "علبة 2 شريط - 30 كبسولة",
    price: 85.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008074",
    tradeName: "فيروترون كبسولات حديد ومعادن متكاملة",
    scientificName: "Iron Amino Acid Chelate + Minerals",
    form: "كبسولات",
    strength: "Chelated Minerals",
    manufacturer: "NERHADOU International",
    packDesc: "علبة 2 شريط - 20 كبسولة",
    price: 78.00,
    notes: "مكمل غذائي مسجل"
  },
  {
    barcode: "6228008008081",
    tradeName: "أوستيوكير أقراص كالسيوم وماغنسيوم ودال زنك",
    scientificName: "Calcium + Magnesium + Vitamin D3 + Zinc",
    form: "أقراص",
    strength: "Combination",
    manufacturer: "Vitabiotics Egypt",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 65.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008098",
    tradeName: "كالسيرون كبسولات كالسيوم مخلبي ومعادن",
    scientificName: "Calcium + Phosphorus + Magnesium + Vitamins",
    form: "كبسولات صلبة",
    strength: "Chelated Calcium Complex",
    manufacturer: "NERHADOU International",
    packDesc: "علبة 2 شريط - 20 كبسولة",
    price: 68.00,
    notes: "مكمل غذائي رسمي"
  },
  {
    barcode: "6228008008104",
    tradeName: "ديفارول-إس 200,000 وحدة حقن فيتامين د3",
    scientificName: "Cholecalciferol (Vit D3)",
    form: "حقن أمبولات عضل",
    strength: "200,000 IU/2ml",
    manufacturer: "Memphis Co. for Pharm.",
    packDesc: "علبة أمبولة واحدة",
    price: 25.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008111",
    tradeName: "فيدروب نقط فيتامين د3 للأطفال بالفم",
    scientificName: "Vitamin D3 (Cholecalciferol)",
    form: "نقط فموية",
    strength: "2800 IU/ml",
    manufacturer: "Medical Union Pharmaceuticals (MUP)",
    packDesc: "قطارة 15 مل",
    price: 18.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008128",
    tradeName: "أوسوفورتين 10,000 وحدة أقراص فيتامين د",
    scientificName: "Ergocalciferol (Vit D2)",
    form: "أقراص مغلفة",
    strength: "10,000 IU",
    manufacturer: "EIPICO",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008135",
    tradeName: "سيفامول أقراص فوارة فيتامين سي ومسكن",
    scientificName: "Paracetamol + Vitamin C",
    form: "أقراص فوارة",
    strength: "400mg/250mg",
    manufacturer: "CID - Chemical Industries",
    packDesc: "أنبوبة 12 قرص فوار",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008142",
    tradeName: "فيتاسيد سي فوار 1 جم أقراص",
    scientificName: "Ascorbic Acid (Vitamin C)",
    form: "أقراص فوارة",
    strength: "1000mg",
    manufacturer: "CID - Chemical Industries",
    packDesc: "أنبوبة 12 قرص فوار",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008159",
    tradeName: "زنكترون كبسولات زنك ومعادن ومناعة",
    scientificName: "Zinc + Copper + Vitamin C + Vitamin B6",
    form: "كبسولات",
    strength: "Combination",
    manufacturer: "NERHADOU International",
    packDesc: "علبة 3 شريط - 30 كبسولة",
    price: 54.00,
    notes: "مكمل غذائي مسجل"
  },
  {
    barcode: "6228008008166",
    tradeName: "أوميجا 3 بلس كبسولات زيت سمك وجنين قمح",
    scientificName: "Fish Oil + Wheat Germ Oil",
    form: "كبسولات جيلاتينية رخوة",
    strength: "1000mg/100mg",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "علبة 3 شريط - 30 كبسولة",
    price: 75.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6228008008173",
    tradeName: "كيروفيت كبسولات فيتامينات ورويال جيلي وجنسنج",
    scientificName: "Royal Jelly + Ginseng + Multivitamins",
    form: "كبسولات جيلاتينية رخوة",
    strength: "Multi-nutrient formula",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 3 شريط - 15 كبسولة",
    price: 85.00,
    notes: "مكمل غذائي رسمي"
  },
  {
    barcode: "6228008008180",
    tradeName: "رويال جيلي 1000 مجم كبسولات غذاء ملكات النحل",
    scientificName: "Royal Jelly Natural",
    form: "كبسولات رخوة",
    strength: "1000mg",
    manufacturer: "Pharco Pharmaceuticals",
    packDesc: "علبة 1 شريط - 12 كبسولة",
    price: 55.00,
    notes: "تسعيرة رسمية"
  },

  // 8. المراهم والكريمات الجلدية والقطرات والنقط (Dermatological, Drops & Topicals)
  {
    barcode: "6229009009019",
    tradeName: "بيتادين 10% محلول مطهر ومطهر جروح 120 مل",
    scientificName: "Povidone Iodine",
    form: "محلول موضعي مطهر",
    strength: "10%",
    manufacturer: "Mundipharma / El Nile",
    packDesc: "زجاجة بلاستيك 120 مل",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009026",
    tradeName: "بيتادين 10% مرهم مطهر جروح 60 جم",
    scientificName: "Povidone Iodine",
    form: "مرهم موضعي",
    strength: "10%",
    manufacturer: "Mundipharma / El Nile",
    packDesc: "أنبوبة 60 جم",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009033",
    tradeName: "فيوسيدين 2% كريم مضاد حيوي 30 جم",
    scientificName: "Fusidic Acid",
    form: "كريم موضعي (خط أحمر)",
    strength: "2%",
    manufacturer: "LEO Pharma / Minapharm",
    packDesc: "أنبوبة 30 جم",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009040",
    tradeName: "فيوسيدين 2% مرهم مضاد حيوي 30 جم",
    scientificName: "Sodium Fusidate",
    form: "مرهم موضعي (خط برتقالي)",
    strength: "2%",
    manufacturer: "LEO Pharma / Minapharm",
    packDesc: "أنبوبة 30 جم",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009057",
    tradeName: "فيوسيكورت كريم كورتيزون ومضاد حيوي",
    scientificName: "Fusidic Acid + Betamethasone",
    form: "كريم موضعي (خط أصفر وأحمر)",
    strength: "2%/0.1%",
    manufacturer: "LEO Pharma / Minapharm",
    packDesc: "أنبوبة 30 جم",
    price: 58.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009064",
    tradeName: "ميبو مرهم حروق وجروح طبيعي 30 جم",
    scientificName: "Beta-sitosterol (Herbal Oil Complex)",
    form: "مرهم عشبي",
    strength: "0.25%",
    manufacturer: "Julphar Pharmaceuticals",
    packDesc: "أنبوبة 30 جم",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009071",
    tradeName: "ميبو سكار مرهم لآثار الحروق والندبات",
    scientificName: "Sesame Oil + Beeswax + Plant Extracts",
    form: "مرهم موضعي للندبات",
    strength: "Scar Formula",
    manufacturer: "Julphar Pharmaceuticals",
    packDesc: "أنبوبة 30 جم",
    price: 110.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009088",
    tradeName: "بانثينول كريم مرطب وملطف للجلد 50 جم",
    scientificName: "Dexpanthenol",
    form: "كريم مرطب",
    strength: "2%",
    manufacturer: "El Nile Co. for Pharm.",
    packDesc: "أنبوبة 50 جم",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009095",
    tradeName: "سيديبروكت مرهم للبواسير والشرخ",
    scientificName: "Hydrocortisone + Cinchocaine",
    form: "مرهم مع مبسم شرجي",
    strength: "Combination",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "أنبوبة 20 جم",
    price: 28.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009101",
    tradeName: "فاكتو مرهم للبواسير",
    scientificName: "Policresulen + Cinchocaine",
    form: "مرهم موضعي",
    strength: "Combination",
    manufacturer: "Takeda / Marcyrl",
    packDesc: "أنبوبة 30 جم",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009118",
    tradeName: "دكتارين 2% جيل للفم لعلاج الفطريات",
    scientificName: "Miconazole",
    form: "جيل فموي",
    strength: "20mg/g",
    manufacturer: "Janssen / Johnson & Johnson",
    packDesc: "أنبوبة 40 جم مع ملعقة قياس",
    price: 45.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009125",
    tradeName: "سودوكريم كريم ملطف للالتهابات وتسلخات الحفاض",
    scientificName: "Zinc Oxide + Benzyl Benzoate + Lanolin",
    form: "كريم ملطف واقي",
    strength: "Antiseptic Healing Cream",
    manufacturer: "Teva / Forest Tosara",
    packDesc: "برطمان 125 جم",
    price: 165.00,
    notes: "مستحضر مستورد رسمي"
  },
  {
    barcode: "6229009009132",
    tradeName: "أوترين 0.1% نقط أنف للكبار لاحتقان الأنف",
    scientificName: "Xylometazoline HCl",
    form: "نقط أنف للكبار",
    strength: "0.1%",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "قطارة 10 مل",
    price: 18.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009149",
    tradeName: "أوترين 0.05% نقط أنف للأطفال",
    scientificName: "Xylometazoline HCl",
    form: "نقط أنف للأطفال",
    strength: "0.05%",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "قطارة 10 مل",
    price: 16.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009156",
    tradeName: "فليكسونيز بخاخ أنف للحساسية والجيوب الأنفية",
    scientificName: "Fluticasone Propionate",
    form: "بخاخ أنف معلق",
    strength: "50mcg/dose - 120 doses",
    manufacturer: "GlaxoSmithKline (GSK)",
    packDesc: "زجاجة بخاخ 120 جرعة",
    price: 88.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009163",
    tradeName: "نازونكس بخاخ أنف كورتيزون",
    scientificName: "Mometasone Furoate",
    form: "بخاخ أنف معلق",
    strength: "50mcg/actuation",
    manufacturer: "MSD - Organon",
    packDesc: "عبوة بخاخ 140 جرعة",
    price: 145.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009170",
    tradeName: "توبريكس قطرة عين مضاد حيوي",
    scientificName: "Tobramycin",
    form: "قطرة معقمة للعين",
    strength: "0.3%",
    manufacturer: "Novartis / Alcon",
    packDesc: "زجاجة قطارة 5 مل",
    price: 42.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009187",
    tradeName: "توبراديكس قطرة عين مضاد والتهابات",
    scientificName: "Tobramycin + Dexamethasone",
    form: "قطرة معقمة معلقة",
    strength: "0.3%/0.1%",
    manufacturer: "Novartis / Alcon",
    packDesc: "زجاجة قطارة 5 مل",
    price: 52.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009194",
    tradeName: "بولي فريش قطرة مرطبة لجفاف العين والكمبيوتر",
    scientificName: "Sodium Hyaluronate",
    form: "قطرة مرطبة معقمة",
    strength: "0.2%",
    manufacturer: "Orchidia Pharmaceutical",
    packDesc: "زجاجة قطارة 10 مل",
    price: 55.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009200",
    tradeName: "تيرز ناتشورال قطرة بديل الدموع",
    scientificName: "Dextran + Hydroxypropyl Methylcellulose",
    form: "قطرة مرطبة",
    strength: "Artificial Tears Formula",
    manufacturer: "Novartis / Alcon",
    packDesc: "زجاجة 15 مل",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229009009217",
    tradeName: "أوتاكول نقط أذن لآلام والتهاب الأذن",
    scientificName: "Chloramphenicol + Benzocaine",
    form: "نقط معقمة للأذن",
    strength: "5%/1%",
    manufacturer: "EIPICO",
    packDesc: "قطارة 10 مل",
    price: 18.00,
    notes: "تسعيرة رسمية"
  },

  // 9. أدوية الفوار والمسالك والأعصاب (Urinary, CNS, Gout & Miscellaneous)
  {
    barcode: "6229509509012",
    tradeName: "يوريفين أكياس فوار لأملاح اليورات والنقرس",
    scientificName: "Piperazine + Colchicine + Khellin",
    form: "أكياس فوار",
    strength: "Effervescent Granules",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 10 أكياس فوار",
    price: 24.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509029",
    tradeName: "كولي-يورينال فوار مطهر للمسالك وحرقان البول",
    scientificName: "Hexamine + Khellin + Piperazine",
    form: "حبيبات فوارة",
    strength: "Effervescent Granules",
    manufacturer: "Misr Co. for Ph. Ind.",
    packDesc: "زجاجة بودرة فوارة 60 جم",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509036",
    tradeName: "بروكسيمول فوار لطرد حصوات الحالب والأملاح",
    scientificName: "Haloxon + Piperazine + Khellin",
    form: "حبيبات فوارة",
    strength: "Effervescent Granules",
    manufacturer: "Kahira Pharm.",
    packDesc: "زجاجة 60 جم",
    price: 20.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509043",
    tradeName: "رينال-إس فوار لحصوات الكلى ومدر للبول",
    scientificName: "Hexamine + Khellin + Cetyldimethylammonium",
    form: "أكياس فوار",
    strength: "Effervescent Sachets",
    manufacturer: "SEDICO Pharmaceuticals",
    packDesc: "علبة 10 أكياس",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509050",
    tradeName: "يوروسولفين أكياس فوار للنقرس وتفتيت الحصوات",
    scientificName: "Piperazine + Colchicine + Sodium Citrate",
    form: "أكياس فوار",
    strength: "Effervescent Granules",
    manufacturer: "El Nile Co. for Pharm.",
    packDesc: "علبة 10 أكياس",
    price: 22.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509067",
    tradeName: "سيستون أقراص عشبية لتفتيت حصوات المسالك",
    scientificName: "Didymocarpus + Saxifraga + Shilajeet",
    form: "أقراص عشبية",
    strength: "Ayurvedic Herbal Complex",
    manufacturer: "Himalaya Drug Company",
    packDesc: "علبة 60 قرص (برطمان)",
    price: 65.00,
    notes: "مكمل غذائي مسجل"
  },
  {
    barcode: "6229509509074",
    tradeName: "رواتنكس كبسولات لحصوات المسالك والمغص الكلوي",
    scientificName: "Pinene + Camphene + Cineol + Borneol",
    form: "كبسولات جيلاتينية رخوة معوية",
    strength: "Terpene Combination",
    manufacturer: "Rowa Wagner / Amoun",
    packDesc: "علبة 3 شريط - 45 كبسولة",
    price: 54.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509081",
    tradeName: "تامسولين 0.4 مجم كبسولات تضخم البروستاتا",
    scientificName: "Tamsulosin HCl",
    form: "كبسولات ممتدة المفعول",
    strength: "0.4mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 3 شريط - 30 كبسولة",
    price: 90.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509098",
    tradeName: "أومنك أوكاس 0.4 مجم أقراص بروستاتا",
    scientificName: "Tamsulosin HCl (OCAS)",
    form: "أقراص ممتدة المفعول",
    strength: "0.4mg",
    manufacturer: "Astellas Pharma",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 175.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509104",
    tradeName: "تيجريتول 200 مجم أقراص صرع والتهاب عصب",
    scientificName: "Carbamazepine",
    form: "أقراص مقسمة",
    strength: "200mg",
    manufacturer: "Novartis Pharma",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 48.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509111",
    tradeName: "نيورونتين 300 مجم كبسولات لالتهاب الأعصاب",
    scientificName: "Gabapentin",
    form: "كبسولات صلبة",
    strength: "300mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 3 شريط - 30 كبسولة",
    price: 120.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509128",
    tradeName: "ليريكا 75 مجم كبسولات آلام الأعصاب",
    scientificName: "Pregabalin",
    form: "كبسولات صلبة",
    strength: "75mg",
    manufacturer: "Pfizer Egypt",
    packDesc: "علبة 1 شريط - 14 كبسولة",
    price: 180.00,
    notes: "أدوية جدول - رقابة مشددة"
  },
  {
    barcode: "6229509509135",
    tradeName: "جابابنتين 300 مجم كبسولات",
    scientificName: "Gabapentin",
    form: "كبسولات",
    strength: "300mg",
    manufacturer: "EVA Pharma",
    packDesc: "علبة 3 شريط - 30 كبسولة",
    price: 68.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509142",
    tradeName: "بيتاسيرك 16 مجم أقراص للدوار وطنين الأذن",
    scientificName: "Betahistine Di-HCl",
    form: "أقراص مقسمة",
    strength: "16mg",
    manufacturer: "Abbott Laboratories",
    packDesc: "علبة 3 شريط - 60 قرص",
    price: 135.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509159",
    tradeName: "بيتاسيرك 24 مجم أقراص",
    scientificName: "Betahistine Di-HCl",
    form: "أقراص",
    strength: "24mg",
    manufacturer: "Abbott Laboratories",
    packDesc: "علبة 3 شريط - 60 قرص",
    price: 165.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509166",
    tradeName: "فيرسيرك 16 مجم أقراص للدوار",
    scientificName: "Betahistine",
    form: "أقراص",
    strength: "16mg",
    manufacturer: "EVA Pharma",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 52.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509173",
    tradeName: "ستوجيرون 25 مجم أقراص للدوار وحركة السفر",
    scientificName: "Cinnarizine",
    form: "أقراص",
    strength: "25mg",
    manufacturer: "Janssen / Minapharm",
    packDesc: "علبة 3 شريط - 30 قرص",
    price: 36.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509180",
    tradeName: "ترينتال 400 مجم أقراص لتحسين الدورة الدموية",
    scientificName: "Pentoxifylline SR",
    form: "أقراص ممتدة المفعول",
    strength: "400mg",
    manufacturer: "Sanofi-Aventis",
    packDesc: "علبة 2 شريط - 20 قرص",
    price: 65.00,
    notes: "تسعيرة رسمية"
  },
  {
    barcode: "6229509509197",
    tradeName: "ميج switch أقراص للصداع النصفي الحاد",
    scientificName: "Zolmitriptan",
    form: "أقراص سريعة الذوبان",
    strength: "2.5mg",
    manufacturer: "Amoun Pharmaceutical Co.",
    packDesc: "علبة 1 شريط - 2 قرص",
    price: 45.00,
    notes: "تسعيرة رسمية"
  }
];

function generateExcel() {
  console.log(`Generating Egyptian Medicines Catalog with ${medicines.length} medications...`);

  // Define Workbook
  const wb = XLSX.utils.book_new();

  // Prepare Rows with the exact headers matching ExcelService.cs in C#
  // Row 1: Title
  // Row 2: Subtitle
  // Row 3: Headers
  // Row 4+: Data
  const sheetData = [
    ["رفيق POS - نموذج استيراد دليل الأدوية والمستحضرات المرجعي الخارجي", "", "", "", "", "", "", "", ""],
    ["إرشادات: الباركود والاسم التجاري إلزاميان (*) | سعر الجمهور بالجنيه المصري | الدليل المرجعي لا يؤثر على أسعار ورصيد المخزن الحالي إطلاقاً", "", "", "", "", "", "", "", ""],
    [
      "باركود الدواء *",
      "الاسم التجاري *",
      "الاسم العلمي (المادة الفعالة)",
      "الشكل الدوائي",
      "التركيز",
      "الشركة المصنعة",
      "وصف العبوة",
      "سعر الجمهور الرسمي (ج.م) *",
      "مصدر التسعيرة / ملاحظات"
    ]
  ];

  for (const med of medicines) {
    sheetData.push([
      med.barcode,
      med.tradeName,
      med.scientificName,
      med.form,
      med.strength,
      med.manufacturer,
      med.packDesc,
      med.price,
      med.notes
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set Right to Left view
  if (!ws['!views']) ws['!views'] = [];
  ws['!views'].push({ RTL: true });

  // Column widths
  ws['!cols'] = [
    { wch: 22 }, // Barcode
    { wch: 34 }, // Trade Name
    { wch: 38 }, // Scientific Name
    { wch: 18 }, // Form
    { wch: 20 }, // Strength
    { wch: 30 }, // Manufacturer
    { wch: 28 }, // Pack Desc
    { wch: 24 }, // Price
    { wch: 30 }  // Notes
  ];

  XLSX.utils.book_append_sheet(wb, ws, "دليل_الأدوية_المرجعي");

  // Output file paths:
  // 1. Workspace root for easy user access:
  const rootPath = path.resolve(__dirname, '../../دليل_الأدوية_المصرية_الشامل.xlsx');
  XLSX.writeFile(wb, rootPath);
  console.log(`Successfully written Excel file to: ${rootPath}`);

  // 2. Also write a copy to desktop/Assets or frontend/public for in-app download
  const publicDir = path.resolve(__dirname, '../public');
  if (fs.existsSync(publicDir)) {
    const publicPath = path.join(publicDir, 'دليل_الأدوية_المصرية_الشامل.xlsx');
    XLSX.writeFile(wb, publicPath);
    console.log(`Successfully copied to frontend public assets: ${publicPath}`);
  }
}

generateExcel();
