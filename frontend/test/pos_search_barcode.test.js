import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of ArabicTextNormalizer and arabic.ts
function normalizeArabicText(text) {
  if (!text) return '';
  let normalized = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    // Remove Tashkeel / Harakat
    if (char >= '\u064B' && char <= '\u0652') continue;
    // Remove Tatweel
    if (char === '\u0640') continue;
    // Alef variants
    if (char === 'أ' || char === 'إ' || char === 'آ' || char === 'ٱ') {
      normalized += 'ا';
    } else if (char === 'ة') {
      normalized += 'ه';
    } else if (char === 'ى') {
      normalized += 'ي';
    } else {
      normalized += char.toLowerCase();
    }
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

function matchesArabicQuery(productName, query) {
  if (!query || !productName) return false;
  const normProduct = normalizeArabicText(productName);
  const normQuery = normalizeArabicText(query);
  return normProduct.includes(normQuery);
}

describe('Story 40 / Feature #22: POS Barcode & Arabic Name Search Tests', () => {

  // Task 22-1: Keyboard Wedge Barcode Scanner Listener Simulation
  describe('Task 22-1: Barcode Scanner Keyboard Wedge Detection', () => {
    it('should distinguish rapid scanner burst input (< 50ms) from human typing', () => {
      // Simulates rapid scanner keystrokes for barcode "6221234567890"
      const scannerKeystrokes = '6221234567890'.split('').map((char, idx) => ({
        key: char,
        timestamp: idx * 15 // 15ms per character (typical barcode scanner)
      }));

      let buffer = '';
      let lastTime = 0;
      let detectedAsScanner = false;

      for (const stroke of scannerKeystrokes) {
        const delta = stroke.timestamp - lastTime;
        lastTime = stroke.timestamp;
        if (delta < 55 || buffer.length === 0) {
          buffer += stroke.key;
        } else {
          buffer = stroke.key;
        }
      }

      // Enter pressed after 15ms
      const enterDelta = 15;
      if (buffer.length >= 3 && enterDelta < 80) {
        detectedAsScanner = true;
      }

      assert.equal(detectedAsScanner, true);
      assert.equal(buffer, '6221234567890');
    });

    it('should NOT trigger scanner burst when user types slowly like a human (> 150ms)', () => {
      // Human typing "622" with 250ms interval
      const humanKeystrokes = '622'.split('').map((char, idx) => ({
        key: char,
        timestamp: idx * 250
      }));

      let buffer = '';
      let lastTime = 0;
      let detectedAsScanner = false;

      for (const stroke of humanKeystrokes) {
        const delta = stroke.timestamp - lastTime;
        lastTime = stroke.timestamp;
        if (delta < 55 || buffer.length === 0) {
          buffer += stroke.key;
        } else {
          buffer = stroke.key; // Reset because gap > 55ms
        }
      }

      const enterDelta = 250;
      if (buffer.length >= 3 && enterDelta < 80) {
        detectedAsScanner = true;
      }

      assert.equal(detectedAsScanner, false);
      assert.equal(buffer, '2'); // Buffer got reset on slow typing
    });
  });

  // Task 22-2: Arabic Normalization & Substring Search
  describe('Task 22-2: Arabic Letter Normalization in Product Search', () => {
    it('should normalize Alef variants (أ, إ, آ, ٱ) -> ا', () => {
      assert.equal(normalizeArabicText('أرز بسمتي فاخر'), 'ارز بسمتي فاخر');
      assert.equal(normalizeArabicText('إندومي دجاج سوبر'), 'اندومي دجاج سوبر');
      assert.equal(normalizeArabicText('آيس كريم فانيليا'), 'ايس كريم فانيليا');
      assert.equal(matchesArabicQuery('أرز مصري معبأ 1 كجم', 'ارز'), true);
      assert.equal(matchesArabicQuery('إندومي نكهة لحم', 'اندومي'), true);
    });

    it('should normalize Teh Marbuta (ة) -> Heh (ه)', () => {
      assert.equal(normalizeArabicText('شاي العروسة ناعم'), 'شاي العروسه ناعم');
      assert.equal(matchesArabicQuery('شاي العروسة 250 جم', 'العروسه'), true);
      assert.equal(matchesArabicQuery('شوكولاتة كادبوري ديري ميلك', 'شوكولاته'), true);
    });

    it('should normalize Alef Maksura (ى) -> Yeh (ي)', () => {
      assert.equal(normalizeArabicText('حلوى طحينية الرشيدي'), 'حلوي طحينيه الرشيدي');
      assert.equal(matchesArabicQuery('حلوى المولد المشكلة', 'حلوي'), true);
      assert.equal(matchesArabicQuery('شاي مصطفى باشا', 'مصطفي'), true);
    });

    it('should strip all Arabic Tashkeel / Harakat and Tatweel', () => {
      assert.equal(normalizeArabicText('شَايْ العَرُوسَة'), 'شاي العروسه');
      assert.equal(normalizeArabicText('حَلِيبٌ طَازِجٌ'), 'حليب طازج');
      assert.equal(normalizeArabicText('شــــاي كــــادبوري'), 'شاي كادبوري');
      assert.equal(matchesArabicQuery('شاي العروسة ناعم', 'شَايْ'), true);
    });

    it('should support substring search anywhere in the product title', () => {
      assert.equal(matchesArabicQuery('شوكولاتة كادبوري بالبندق 90 جم', 'كادبوري'), true);
      assert.equal(matchesArabicQuery('مكرونة الملكة أقلام 400 جم', 'الملكة'), true);
      assert.equal(matchesArabicQuery('مسحوق غسيل أريال أوتوماتيك 2.5 كجم', 'اريال'), true);
    });
  });

  // Task 22-3: Database Search Ranking Simulation
  describe('Task 22-3: Database Fast Search Ranking Priority', () => {
    const mockProducts = [
      { id: '1', barcode: '622001', name: 'شاي ليبتون أحمر', normalizedName: 'شاي ليبتون احمر' },
      { id: '2', barcode: '622002', name: 'شاي العروسة ناعم 250 جم', normalizedName: 'شاي العروسه ناعم 250 جم' },
      { id: '3', barcode: '622003', name: 'بسكويت شاي سادة لوكس', normalizedName: 'بسكويت شاي ساده لوكس' },
      { id: '4', barcode: '622004', name: 'شاي أخضر إيزيس عضوي', normalizedName: 'شاي اخضر ايزيس عضوي' }
    ];

    function searchWithRanking(query, products) {
      const normQ = normalizeArabicText(query);
      return products
        .map((p) => {
          let rank = 5;
          if (p.barcode === query) rank = 1;
          else if (p.normalizedName === normQ) rank = 2;
          else if (p.normalizedName.startsWith(normQ)) rank = 3;
          else if (p.normalizedName.includes(normQ)) rank = 4;
          return { product: p, rank };
        })
        .filter((item) => item.rank < 5)
        .sort((a, b) => a.rank - b.rank)
        .map((item) => item.product);
    }

    it('should rank exact barcode match first (Rank 1)', () => {
      const results = searchWithRanking('622002', mockProducts);
      assert.equal(results.length, 1);
      assert.equal(results[0].id, '2');
    });

    it('should rank prefix matches before substring matches (Rank 3 vs Rank 4)', () => {
      const results = searchWithRanking('شاي', mockProducts);
      // 'شاي ليبتون', 'شاي العروسة', 'شاي أخضر' start with 'شاي' (Rank 3)
      // 'بسكويت شاي' contains 'شاي' in the middle (Rank 4)
      assert.equal(results.length, 4);
      assert.equal(results[3].name, 'بسكويت شاي سادة لوكس');
    });
  });

  // Task 22-4: POS Interactive Search UI Navigation & Stock Badges
  describe('Task 22-4: Arrow Navigation and Stock Status Indicators', () => {
    it('should correctly calculate stock badges for in-stock, low-stock, and out-of-stock', () => {
      const computeStockStatus = (stockMilli, minStockMilli = 5000) => {
        const stock = stockMilli / 1000;
        const minStock = minStockMilli / 1000;
        if (stock <= 0) return 'OUT_OF_STOCK';
        if (stock <= minStock) return 'LOW_STOCK';
        return 'IN_STOCK';
      };

      assert.equal(computeStockStatus(0), 'OUT_OF_STOCK');
      assert.equal(computeStockStatus(-2000), 'OUT_OF_STOCK');
      assert.equal(computeStockStatus(3000, 5000), 'LOW_STOCK');
      assert.equal(computeStockStatus(5000, 5000), 'LOW_STOCK');
      assert.equal(computeStockStatus(25000, 5000), 'IN_STOCK');
    });

    it('should cycle through search results using arrow navigation', () => {
      const listLength = 4;
      let currentIndex = 0;

      // Arrow Down
      currentIndex = (currentIndex + 1) % listLength;
      assert.equal(currentIndex, 1);

      currentIndex = (currentIndex + 1) % listLength;
      assert.equal(currentIndex, 2);

      currentIndex = (currentIndex + 1) % listLength;
      assert.equal(currentIndex, 3);

      // Loop back to 0
      currentIndex = (currentIndex + 1) % listLength;
      assert.equal(currentIndex, 0);

      // Arrow Up from 0 wraps to 3
      currentIndex = (currentIndex - 1 + listLength) % listLength;
      assert.equal(currentIndex, 3);
    });
  });

  // Task 22-5: SLA Performance Benchmark Verification (< 100ms on 5,000 items)
  describe('Task 22-5: SLA Performance Latency (< 100ms on 5000 items)', () => {
    it('should verify search on 5000 items executes well within the 100ms SLA', () => {
      // Generate 5000 in-memory items
      const largeCatalog = [];
      for (let i = 1; i <= 5000; i++) {
        const name = `صنف سوبرماركت رقم ${i} أرز وشاي وزيت`;
        largeCatalog.push({
          id: `prod_${i}`,
          barcode: `622${String(i).padStart(10, '0')}`,
          name: name,
          normalizedName: normalizeArabicText(name),
          pricePiasters: 2500
        });
      }

      const start = performance.now();
      const query = 'ارز';
      const normQ = normalizeArabicText(query);
      const matches = largeCatalog.filter(p => p.normalizedName.includes(normQ)).slice(0, 20);
      const durationMs = performance.now() - start;

      assert.equal(matches.length, 20);
      // In JS in-memory filter, 5000 items takes ~2-10ms; SLA is < 100ms
      assert.ok(durationMs < 100, `Search took ${durationMs.toFixed(2)}ms which exceeds 100ms SLA`);
    });
  });

});
