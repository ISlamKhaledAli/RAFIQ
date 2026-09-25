import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Client-side mirror of ArabicTextNormalizer logic
function normalizeArabicText(text) {
  if (!text) return '';
  let res = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    // Strip tashkeel
    if (c >= '\u064B' && c <= '\u0652') continue;
    // Strip tatweel
    if (c === '\u0640') continue;

    // Normalize Alefs
    if (c === 'أ' || c === 'إ' || c === 'آ' || c === 'ٱ') {
      res += 'ا';
    } else if (c === 'ة') {
      res += 'ه';
    } else if (c === 'ى') {
      res += 'ي';
    } else {
      res += c.toLowerCase();
    }
  }
  return res.replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(s, t) {
  if (!s) return t ? t.length : 0;
  if (!t) return s.length;
  const n = s.length;
  const m = t.length;
  const d = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[n][m];
}

function areNamesSimilar(name1, name2) {
  const norm1 = normalizeArabicText(name1);
  const norm2 = normalizeArabicText(name2);
  if (!norm1 || !norm2) return { isSimilar: false };

  if (norm1 === norm2) {
    return { isSimilar: true, reason: 'تطابق تام بعد توحيد الحروف والهمزات' };
  }

  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen >= 5 && Math.abs(norm1.length - norm2.length) <= 1) {
    const dist = levenshteinDistance(norm1, norm2);
    if (dist === 1) {
      return { isSimilar: true, reason: 'تشابه كبير جداً باختلاف حرف واحد فقط' };
    }
  }

  return { isSimilar: false };
}

// Batch row validation simulation (Task 134-3)
function validateBatchImportRows(existingCatalog, incomingRows) {
  const barcodeMap = new Map();
  for (const item of existingCatalog) {
    if (item.barcode) {
      barcodeMap.set(item.barcode, item.name);
    }
  }

  const results = [];
  const incomingSeenBarcodes = new Set();

  for (let idx = 0; idx < incomingRows.length; idx++) {
    const row = incomingRows[idx];
    const errors = [];
    const warnings = [];

    // 1. Barcode duplicate check
    if (row.barcode) {
      if (barcodeMap.has(row.barcode)) {
        errors.push(`الباركود '${row.barcode}' مسجل بالفعل للصنف: ${barcodeMap.get(row.barcode)}`);
      } else if (incomingSeenBarcodes.has(row.barcode)) {
        errors.push(`الباركود '${row.barcode}' مكرر داخل نفس ملف الاستيراد`);
      } else {
        incomingSeenBarcodes.add(row.barcode);
      }
    }

    // 2. Similar name check against catalog
    for (const item of existingCatalog) {
      const sim = areNamesSimilar(row.name, item.name);
      if (sim.isSimilar) {
        warnings.push(`اسم الصنف مشابه للصنف المسجل '${item.name}' (${sim.reason})`);
        break;
      }
    }

    results.push({
      rowIndex: idx + 1,
      row,
      isValid: errors.length === 0,
      errors,
      warnings
    });
  }

  return results;
}

describe('Rafiq POS Arabic Normalization & Similar Name Detection (Feature #134 / Task 134-2)', () => {
  it('normalizes Arabic Alef variants (أ, إ, آ, ٱ) into standard Alef (ا)', () => {
    assert.equal(normalizeArabicText('أرز'), 'ارز');
    assert.equal(normalizeArabicText('إندومي'), 'اندومي');
    assert.equal(normalizeArabicText('آيس كريم'), 'ايس كريم');
  });

  it('strips all Arabic tashkeel (fatha, damma, kasra, shadda, sukun, tanween)', () => {
    assert.equal(normalizeArabicText('شَايْ العَرُوسَة'), 'شاي العروسه');
    assert.equal(normalizeArabicText('حَلِيبٌ جُهَيْنَة'), 'حليب جهينه');
  });

  it('normalizes Teh Marbuta (ة) to Heh (ه) and Alef Maksura (ى) to Yeh (ي)', () => {
    assert.equal(normalizeArabicText('مكرونة'), 'مكرونه');
    assert.equal(normalizeArabicText('شوكولاتة كادبوري'), 'شوكولاته كادبوري');
    assert.equal(normalizeArabicText('حلوى'), 'حلوي');
    assert.equal(normalizeArabicText('مصطفى'), 'مصطفي');
  });

  it('removes Tatweel (ـ) and collapses multiple whitespaces', () => {
    assert.equal(normalizeArabicText('شـــــاي    العروسة'), 'شاي العروسه');
  });

  it('flags two products with same Arabic letters but different hamzas as identical (Task 134-2)', () => {
    const sim1 = areNamesSimilar('أرز الضحى 1 كجم', 'ارز الضحي 1 كجم');
    assert.equal(sim1.isSimilar, true);
    assert.ok(sim1.reason.includes('تطابق'));
  });

  it('flags products with a single character difference as very similar (Task 134-2)', () => {
    const sim = areNamesSimilar('شامبو بانتين 400مل', 'شامبو بانتين 400ملل');
    assert.equal(sim.isSimilar, true);
    assert.ok(sim.reason.includes('تشابه كبير'));
  });

  it('does not falsely flag completely different products as similar', () => {
    const sim = areNamesSimilar('شاي ليبتون 100 فتلة', 'سكر الأسرة 1 كجم');
    assert.equal(sim.isSimilar, false);
  });
});

describe('Rafiq POS Duplicate Barcode & Batch Import Validation (Feature #134 / Task 134-1 & 134-3)', () => {
  const existingCatalog = [
    { id: '1', name: 'شاي العروسة 250جم', barcode: '6221001002001' },
    { id: '2', name: 'سكر الأسرة 1كجم', barcode: '6221001002002' },
    { id: '3', name: 'أرز الضحى 1كجم', barcode: '6221001002003' }
  ];

  it('detects duplicate barcode against existing catalog with owner name (Task 134-1)', () => {
    const incomingRows = [
      { name: 'شاي جديد', barcode: '6221001002001' }
    ];
    const results = validateBatchImportRows(existingCatalog, incomingRows);
    assert.equal(results[0].isValid, false);
    assert.ok(results[0].errors[0].includes('مسجل بالفعل للصنف: شاي العروسة 250جم'));
  });

  it('detects duplicate barcodes occurring within the same batch/excel file (Task 134-3)', () => {
    const incomingRows = [
      { name: 'صنف أ', barcode: '999000111' },
      { name: 'صنف ب', barcode: '999000111' } // Duplicate in same file
    ];
    const results = validateBatchImportRows(existingCatalog, incomingRows);
    assert.equal(results[0].isValid, true);
    assert.equal(results[1].isValid, false);
    assert.ok(results[1].errors[0].includes('مكرر داخل نفس ملف الاستيراد'));
  });

  it('identifies similar names in incoming batch rows and produces clear warnings (Task 134-3)', () => {
    const incomingRows = [
      { name: 'ارز الضحي 1كجم', barcode: '6221999999999' } // Similar to 'أرز الضحى 1كجم'
    ];
    const results = validateBatchImportRows(existingCatalog, incomingRows);
    assert.equal(results[0].isValid, true); // Still valid because it's a warning, not a hard blocking error
    assert.equal(results[0].warnings.length, 1);
    assert.ok(results[0].warnings[0].includes('أرز الضحى 1كجم'));
  });
});
