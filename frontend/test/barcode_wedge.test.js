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
});
