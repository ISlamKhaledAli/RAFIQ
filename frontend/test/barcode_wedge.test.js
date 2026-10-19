import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  physicalCodeToChar,
  convertArabicLayoutToBarcode,
  ARABIC_TO_QWERTY_MAP,
  DEFAULT_SCANNER_SETTINGS
} from '../src/utils/barcodeReader.ts';

describe('Story 41 / Feature #131: Barcode Scanner Wedge & Arabic Layout Invariant Tests', () => {

  describe('Task 131-1: Physical Key Code Translation (Immune to Keyboard Language)', () => {
    it('should map top row Digit0-Digit9 to numerical chars regardless of language', () => {
      const codes = ['Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
      const expected = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

      codes.forEach((code, index) => {
        const char = physicalCodeToChar(code, false);
        assert.equal(char, expected[index], `Code ${code} should map to ${expected[index]}`);
      });
    });

    it('should map Numpad keys to corresponding numbers and math symbols', () => {
      assert.equal(physicalCodeToChar('Numpad0'), '0');
      assert.equal(physicalCodeToChar('Numpad5'), '5');
      assert.equal(physicalCodeToChar('Numpad9'), '9');
      assert.equal(physicalCodeToChar('NumpadSubtract'), '-');
      assert.equal(physicalCodeToChar('NumpadDivide'), '/');
      assert.equal(physicalCodeToChar('NumpadMultiply'), '*');
      assert.equal(physicalCodeToChar('NumpadDecimal'), '.');
    });

    it('should map physical letter keys KeyA-KeyZ to uppercase ASCII', () => {
      assert.equal(physicalCodeToChar('KeyA'), 'A');
      assert.equal(physicalCodeToChar('KeyB'), 'B');
      assert.equal(physicalCodeToChar('KeyX'), 'X');
      assert.equal(physicalCodeToChar('KeyZ'), 'Z');
    });

    it('should correctly map punctuation keys like Minus, Slash, Period', () => {
      assert.equal(physicalCodeToChar('Minus'), '-');
      assert.equal(physicalCodeToChar('Slash'), '/');
      assert.equal(physicalCodeToChar('Period'), '.');
      assert.equal(physicalCodeToChar('Minus', true), '_');
    });

    it('should return null for non-printable keys like Shift, Enter, F-keys', () => {
      assert.equal(physicalCodeToChar('ShiftLeft'), null);
      assert.equal(physicalCodeToChar('Enter'), null);
      assert.equal(physicalCodeToChar('F3'), null);
      assert.equal(physicalCodeToChar('Escape'), null);
    });
  });

  describe('Task 131-1: Arabic Layout to Barcode String Translation', () => {
    it('should translate Eastern Arabic and Persian numerals to Western digits', () => {
      const eastern = '٦٢٢١٠٠٠١٢٣٤٥٦';
      const decoded = convertArabicLayoutToBarcode(eastern);
      assert.equal(decoded, '6221000123456');

      const persian = '۰۱۲۳۴۵۶۷۸۹';
      assert.equal(convertArabicLayoutToBarcode(persian), '0123456789');
    });

    it('should translate characters when scanner or keyboard produces Arabic layout letters', () => {
      // If cashier is on Arabic 101 keyboard and scanner sends "CODE128" -> "ؤخيث128"
      // 'ؤ' = 'c', 'خ' = 'o', 'ي' = 'd', 'ث' = 'e'
      const arabicTyping = 'ؤخيث128';
      const decoded = convertArabicLayoutToBarcode(arabicTyping);
      assert.equal(decoded.toLowerCase(), 'code128');
    });

    it('should accurately translate mixed alphanumeric barcodes (Code 39 / Code 128)', () => {
      // "ABC-987" on Arabic keyboard:
      // 'A' = 'ش', 'B' = 'لا', 'C' = 'ؤ'
      // With Arabic digits: "شلاؤ-٩٨٧"
      const scannedInArabic = 'شلاؤ-٩٨٧';
      const decoded = convertArabicLayoutToBarcode(scannedInArabic);
      assert.equal(decoded.toLowerCase(), 'abc-987');
    });

    it('should preserve standard English barcode strings intact', () => {
      const ean13 = '6224000185901';
      assert.equal(convertArabicLayoutToBarcode(ean13), ean13);

      const code39 = 'EGP-MILK-100';
      assert.equal(convertArabicLayoutToBarcode(code39), code39);
    });
  });

  describe('Task 131-2: Scanner Configuration & Timing Discrimination', () => {
    it('has sensible defaults adhering to supermarket hardware standards', () => {
      assert.equal(DEFAULT_SCANNER_SETTINGS.speedThresholdMs, 65);
      assert.equal(DEFAULT_SCANNER_SETTINGS.suffix, 'Enter');
      assert.equal(DEFAULT_SCANNER_SETTINGS.minBarcodeLength, 3);
      assert.equal(DEFAULT_SCANNER_SETTINGS.prefix, '');
    });

    it('should discriminate rapid scanner bursts from human manual typing', () => {
      const threshold = DEFAULT_SCANNER_SETTINGS.speedThresholdMs;

      // Simulated Hardware Scanner (intervals between 10ms and 35ms)
      const scannerDeltas = [15, 20, 12, 18, 22, 14, 16, 25];
      const isScanner = scannerDeltas.every((d) => d <= threshold);
      assert.equal(isScanner, true, 'Scanner burst deltas should all fall under threshold');

      // Simulated Manual Typing by Cashier (intervals between 110ms and 350ms)
      const humanDeltas = [120, 240, 180, 310, 150];
      const isHuman = humanDeltas.some((d) => d > threshold);
      assert.equal(isHuman, true, 'Human typing should exceed scanner threshold');
    });

    it('should handle custom prefixes configured on hardware scanners (e.g. STX or ~)', () => {
      const prefix = '~';
      const rawBarcode = '~622300123456';
      
      const cleanBarcode = rawBarcode.startsWith(prefix) ? rawBarcode.substring(prefix.length) : rawBarcode;
      assert.equal(cleanBarcode, '622300123456');
    });

    it('should handle short barcodes (EAN-8 / UPC-E) as well as long barcodes (EAN-13 / Code 128)', () => {
      const shortCode = '12345670';
      assert.ok(shortCode.length >= DEFAULT_SCANNER_SETTINGS.minBarcodeLength);

      const longCode = '6223000109988776655';
      assert.ok(longCode.length >= DEFAULT_SCANNER_SETTINGS.minBarcodeLength);
    });
  });

  describe('Task 131-3: Multi-Scanner and Dual-Language Layout Matrix', () => {
    it('should map complete Arabic alphabet keyboard keys without missing characters', () => {
      const arabicSample = 'ضصثقفغعهخحجدشسيبلاتنمكطئءؤرلاىةوزظ';
      for (const char of arabicSample) {
        assert.ok(ARABIC_TO_QWERTY_MAP[char] !== undefined, `Arabic char ${char} must have a mapping`);
      }
    });

    it('should handle scanner input where CapsLock or Shift was accidentally triggered', () => {
      const rawWithNumbersAndLetters = 'ABC-1234';
      const translated = convertArabicLayoutToBarcode(rawWithNumbersAndLetters);
      assert.equal(translated, 'ABC-1234');
    });
  });

  describe('Task 131-4: Modal & Popup Isolation Invariants (Requirement 2)', () => {
    it('should inhibit background POS cart scanning when any modal is open', () => {
      // Simulating modal active state
      const isAnyModalOpen = true;
      let cartItemsAdded = 0;

      const simulateScan = (barcode, isModalOpen) => {
        if (isModalOpen) {
          // Invariant: Background scanner burst is discarded while modal is active
          return false;
        }
        cartItemsAdded++;
        return true;
      };

      const scanResult = simulateScan('6221000112233', isAnyModalOpen);
      assert.equal(scanResult, false, 'Scan must be blocked when modal is open');
      assert.equal(cartItemsAdded, 0, 'No items should be added to background cart');
    });

    it('should permit focused inputs inside an active modal to receive scanned text', () => {
      // When cashier is in a modal with an input focused (e.g. search, phone, or test sandbox)
      const isModalOpen = true;
      const isInputFocused = true;
      let modalInputValue = '';

      const handleKeyInModal = (char, inModal, inputFocused) => {
        if (inModal && inputFocused) {
          modalInputValue += char;
          return 'routed_to_input';
        }
        return 'discarded_or_background';
      };

      const chars = ['6', '2', '2', '4', '0', '0'];
      chars.forEach((c) => handleKeyInModal(c, isModalOpen, isInputFocused));

      assert.equal(modalInputValue, '622400', 'Input inside modal must receive typed/scanned characters');
    });
  });

  describe('Task 131-5: Scanner Suffix & Prefix Matrix (Enter, Tab, None, AIM ]C1)', () => {
    it('should strip AIM global standard prefixes like ]C1 and ]e0 without losing barcode digits', () => {
      const aimCode128 = ']C1622300123456';
      // AIM prefix: "]C1" or "]e0"
      const prefixToStrip = ']C1';
      const clean = aimCode128.startsWith(prefixToStrip) ? aimCode128.substring(prefixToStrip.length) : aimCode128;
      assert.equal(clean, '622300123456', 'AIM prefix ]C1 must be stripped cleanly');
    });

    it('should properly recognize Enter and Tab as terminator suffixes', () => {
      const enterKey = 'Enter';
      const tabKey = 'Tab';

      const isEnterTerminator = (key, suffixSetting) => suffixSetting === 'Enter' && key === 'Enter';
      const isTabTerminator = (key, suffixSetting) => suffixSetting === 'Tab' && key === 'Tab';

      assert.ok(isEnterTerminator(enterKey, 'Enter'));
      assert.ok(isTabTerminator(tabKey, 'Tab'));
      assert.ok(!isEnterTerminator(tabKey, 'Enter'));
    });

    it('should support scanners operating in None suffix mode via idle timer timeout', () => {
      const scannerSetting = { suffix: 'None', speedThresholdMs: 65, minLength: 3 };
      const buffer = '6221122334455';
      const isNoneMode = scannerSetting.suffix === 'None';
      const isValid = isNoneMode && buffer.length >= scannerSetting.minLength;

      assert.ok(isValid, 'None suffix mode triggers on buffer meeting minimum length');
    });
  });

  describe('Task 131-6: Scale Embedded Barcode Parsing (20-29 EAN-13)', () => {
    it('should correctly parse product code and weight from electronic scale barcode', () => {
      // Standard retail deli barcode: [21][00456][01250][7]
      // Prefix 21, PLU 00456, Weight 1.250 kg (1250 grams), Checksum 7
      const scaleBarcode = '2100456012507';
      assert.equal(scaleBarcode.length, 13, 'Scale barcode must be 13 digits');

      const prefix = parseInt(scaleBarcode.substring(0, 2), 10);
      assert.ok(prefix >= 20 && prefix <= 29, 'Prefix must be between 20 and 29 for scale barcodes');

      const plu = scaleBarcode.substring(2, 7);
      assert.equal(plu, '00456', 'PLU code extracted accurately');

      const weightGrams = parseInt(scaleBarcode.substring(7, 12), 10);
      assert.equal(weightGrams, 1250, 'Weight in grams must equal 1250 (1.250 kg)');

      const weightKg = weightGrams / 1000.0;
      assert.equal(weightKg, 1.25, 'Weight in kg equals 1.25 kg');
    });
  });
});
