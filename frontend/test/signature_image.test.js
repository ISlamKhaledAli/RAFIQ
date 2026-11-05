import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  MAX_SIGNATURE_IMAGES,
  SIGNATURE_IMAGE_HOST_MAX_CHARS,
  SIGNATURE_IMAGE_HOST_MAX_HEIGHT,
  SIGNATURE_IMAGE_HOST_MAX_WIDTH,
  SIGNATURE_IMAGE_LIST_MAX_CHARS,
  SIGNATURE_IMAGE_PREFIX,
  findContentBounds,
  fitSignatureSize,
  isValidSignatureImageValue,
  parseSignatureImages,
  pickSignatureImageIndex,
  resolveSignatureImageSrc,
  signatureImagePool,
  serializeSignatureImages,
  signatureCurve,
  whiteCompositeLuma,
} from '../src/utils/signatureImage.ts';

// Smallest PNG-shaped header the validators read: signature + IHDR(width, height) (no pixel data needed for the header checks)
function pngBytes(width, height, signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], chunk = 'IHDR') {
  const b = Buffer.alloc(33);
  Buffer.from(signature).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write(chunk, 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
const dataUrl = (bytes) => SIGNATURE_IMAGE_PREFIX + bytes.toString('base64');

describe('signature images: list parsing and serializing', () => {
  const one = dataUrl(pngBytes(10, 10));
  const two = dataUrl(pngBytes(20, 20));

  it('parses every stored form', () => {
    assert.deepEqual(parseSignatureImages(''), ['default']);
    assert.deepEqual(parseSignatureImages(undefined), ['default']);
    assert.deepEqual(parseSignatureImages('none'), []);
    assert.deepEqual(parseSignatureImages(one), [one], 'a single data URL (old stored value) is a list of one');
    assert.deepEqual(parseSignatureImages(JSON.stringify(['default', one, two])), ['default', one, two]);
    assert.deepEqual(parseSignatureImages(JSON.stringify([one])), [one]);
  });

  it('anything invalid parses to an empty list', () => {
    for (const bad of ['garbage', 'data:image/jpeg;base64,AAAA', '[', '[1,2]', '{"a":1}', '[]', JSON.stringify(['none']), JSON.stringify(['']), JSON.stringify(['default', 'default'])]) {
      assert.deepEqual(parseSignatureImages(bad), [], bad.slice(0, 30));
    }
  });

  it('serializes to the shortest compatible form and round-trips', () => {
    assert.equal(serializeSignatureImages(['default']), '');
    assert.equal(serializeSignatureImages([]), 'none');
    assert.equal(serializeSignatureImages([one]), one, 'exactly one custom image: the data URL itself, readable by the old format');
    assert.equal(serializeSignatureImages(['default', one]), JSON.stringify(['default', one]));
    for (const list of [['default'], [], [one], ['default', one], [one, two, 'default']]) {
      assert.deepEqual(parseSignatureImages(serializeSignatureImages(list)), list);
    }
  });

  it('"default" expands into every built-in image in the pick pool; custom images stay single entries', () => {
    const BUILT = ['/s/default_01.png', '/s/default_02.png', '/s/default_03.png'];
    assert.deepEqual(signatureImagePool('', BUILT), BUILT, "'' = the built-in set");
    assert.deepEqual(signatureImagePool('none', BUILT), []);
    assert.deepEqual(signatureImagePool(one, BUILT), [one]);
    assert.deepEqual(signatureImagePool(JSON.stringify(['default', one, two]), BUILT), [...BUILT, one, two], 'default(3) + custom(2) = 5');
    assert.deepEqual(signatureImagePool(JSON.stringify([one, 'default']), BUILT), [one, ...BUILT], 'the position of "default" is kept');
    assert.deepEqual(signatureImagePool('', []), [], 'an empty built-in set has nothing to show');
    assert.deepEqual(signatureImagePool('garbage', BUILT), []);
  });

  it('the preview source follows the picked pool image', () => {
    const BUILT = ['/s/default_01.png', '/s/default_02.png', '/s/default_03.png'];
    assert.ok(BUILT.includes(resolveSignatureImageSrc('', 'any', BUILT)));
    assert.equal(resolveSignatureImageSrc('none', 'any', BUILT), null);
    assert.equal(resolveSignatureImageSrc(one, 'any', BUILT), one);
    assert.equal(resolveSignatureImageSrc('garbage', 'any', BUILT), null);
    assert.equal(resolveSignatureImageSrc('', 'any', []), null);
    const list = serializeSignatureImages(['default', one, two]);
    const pool = [...BUILT, one, two];
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(resolveSignatureImageSrc(list, `sale-${i}`, BUILT));
    assert.deepEqual([...seen].sort(), [...pool].sort(), 'all five images are used');
    assert.equal(resolveSignatureImageSrc(list, 'sale-7', BUILT), pool[pickSignatureImageIndex('sale-7', 5)], 'index = fnv1a32(key) % pool size');
    assert.equal(resolveSignatureImageSrc(list, 'x', BUILT, 4), two, 'a forced pool index wins');
    assert.equal(resolveSignatureImageSrc(list, 'x', BUILT, 1), BUILT[1]);
    assert.equal(resolveSignatureImageSrc(list, 'x', BUILT, 9), resolveSignatureImageSrc(list, 'x', BUILT), 'an out-of-range index falls back to the invoice pick');
    assert.equal(resolveSignatureImageSrc(list, 'x', BUILT, null), resolveSignatureImageSrc(list, 'x', BUILT));
  });
});

describe('signature images: the per-invoice pick is FNV-1a over UTF-16 code units (C# twin asserted in S51)', () => {
  // [key, count, expected index]: the same rows are hardcoded in S51_ReceiptTextSettingsTest.PickSignatureImageIndex_MatchesTheFrontendTable
  const TABLE = [
  ['sale_internal_guid_123', 1, 0],
  ['sale_internal_guid_123', 2, 1],
  ['sale_internal_guid_123', 3, 1],
  ['sale_internal_guid_123', 5, 4],
  ['sale_internal_guid_123', 8, 1],
  ['a', 1, 0],
  ['a', 2, 0],
  ['a', 3, 1],
  ['a', 5, 0],
  ['a', 8, 4],
  ['abc', 1, 0],
  ['abc', 2, 1],
  ['abc', 3, 2],
  ['abc', 5, 1],
  ['abc', 8, 3],
  ['sale-0001', 1, 0],
  ['sale-0001', 2, 0],
  ['sale-0001', 3, 0],
  ['sale-0001', 5, 1],
  ['sale-0001', 8, 6],
  ['sale-0002', 1, 0],
  ['sale-0002', 2, 1],
  ['sale-0002', 3, 1],
  ['sale-0002', 5, 2],
  ['sale-0002', 8, 3],
  ['sale-0003', 1, 0],
  ['sale-0003', 2, 0],
  ['sale-0003', 3, 2],
  ['sale-0003', 5, 3],
  ['sale-0003', 8, 0],
  ['ret_9f2c', 1, 0],
  ['ret_9f2c', 2, 1],
  ['ret_9f2c', 3, 1],
  ['ret_9f2c', 5, 3],
  ['ret_9f2c', 8, 1],
  ['الفاتورة', 1, 0],
  ['الفاتورة', 2, 0],
  ['الفاتورة', 3, 0],
  ['الفاتورة', 5, 0],
  ['الفاتورة', 8, 2],
  ['4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d', 1, 0],
  ['4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d', 2, 1],
  ['4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d', 3, 0],
  ['4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d', 5, 1],
  ['4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d', 8, 7],
  ['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 1, 0],
  ['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 2, 1],
  ['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 3, 2],
  ['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 5, 0],
  ['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 8, 5]
  ];

  it('matches the fixed table and the spec edge cases', () => {
    for (const [key, count, expected] of TABLE) {
      assert.equal(pickSignatureImageIndex(key, count), expected, `${key} / ${count}`);
    }
    assert.equal(pickSignatureImageIndex('', 5), 0, 'an empty key gives 0');
    assert.equal(pickSignatureImageIndex('a', 0), -1);
    assert.equal(pickSignatureImageIndex('a', -3), -1);
  });

  it('is the textbook FNV-1a: independent reference implementation', () => {
    const reference = (key) => {
      let h = 2166136261n;
      for (let i = 0; i < key.length; i++) h = ((h ^ BigInt(key.charCodeAt(i))) * 16777619n) & 0xffffffffn;
      return Number(h);
    };
    for (const key of ['sale_1', 'ret_2', 'الفاتورة', 'x'.repeat(200)]) {
      for (const count of [1, 2, 3, 7, 8]) assert.equal(pickSignatureImageIndex(key, count), reference(key) % count);
    }
  });

  it('is deterministic and spreads different invoice ids across the list', () => {
    assert.equal(pickSignatureImageIndex('sale-42', 8), pickSignatureImageIndex('sale-42', 8));
    const hits = new Array(5).fill(0);
    for (let i = 0; i < 500; i++) hits[pickSignatureImageIndex(`sale-${i}`, 5)]++;
    assert.ok(hits.every((n) => n > 50), `each of 5 images used: ${hits}`);
  });

  it('the C# NUnit table has exactly the same rows', () => {
    const cs = fs.readFileSync(path.resolve('..', 'desktop', 'RafiqPOS.Tests', 'Scenarios', 'S51_ReceiptTextSettingsTest.cs'), 'utf8');
    for (const [key, count, expected] of TABLE) {
      assert.ok(cs.includes(`"${key}|${count}|${expected}"`), `S51 has the row ${key} / ${count}`);
    }
  });
});

describe('signature image: validation mirrors the host rules', () => {
  it("accepts '', 'none', a 1x1 PNG, the built-in banner and the maximum dimensions", () => {
    assert.equal(isValidSignatureImageValue(''), true);
    assert.equal(isValidSignatureImageValue('none'), true);
    assert.equal(isValidSignatureImageValue(undefined), true);
    assert.equal(isValidSignatureImageValue(dataUrl(pngBytes(1, 1))), true);
    assert.equal(isValidSignatureImageValue(dataUrl(pngBytes(SIGNATURE_IMAGE_HOST_MAX_WIDTH, SIGNATURE_IMAGE_HOST_MAX_HEIGHT))), true);
    const banner = fs.readFileSync(path.resolve('src', 'assets', 'signatures', 'default_01.png'));
    assert.equal(isValidSignatureImageValue(dataUrl(banner)), true, 'the real built-in image passes');
  });

  it('rejects a wrong prefix, a non-PNG, bad base64 and oversize dimensions', () => {
    const png = pngBytes(100, 50);
    assert.equal(isValidSignatureImageValue('data:image/jpeg;base64,' + png.toString('base64')), false, 'wrong prefix');
    assert.equal(isValidSignatureImageValue('data:image/png;base64,' + png.toString('base64') + '!!'), false, 'invalid base64 characters');
    assert.equal(isValidSignatureImageValue(SIGNATURE_IMAGE_PREFIX + png.toString('base64').slice(0, -1)), false, 'base64 length not a multiple of 4');
    assert.equal(isValidSignatureImageValue(SIGNATURE_IMAGE_PREFIX + ' ' + png.toString('base64')), false, 'whitespace');
    assert.equal(isValidSignatureImageValue(dataUrl(Buffer.from('GIF89a'.padEnd(33, 'x')))), false, 'not PNG bytes');
    assert.equal(isValidSignatureImageValue(dataUrl(pngBytes(100, 50, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]))), false, 'broken signature');
    assert.equal(isValidSignatureImageValue(dataUrl(pngBytes(100, 50, undefined, 'IDAT'))), false, 'first chunk is not IHDR');
    assert.equal(isValidSignatureImageValue(dataUrl(pngBytes(SIGNATURE_IMAGE_HOST_MAX_WIDTH + 1, 100))), false, 'too wide');
    assert.equal(isValidSignatureImageValue(dataUrl(pngBytes(100, SIGNATURE_IMAGE_HOST_MAX_HEIGHT + 1))), false, 'too tall');
    assert.equal(isValidSignatureImageValue(dataUrl(pngBytes(0, 10))), false, 'zero width');
    assert.equal(isValidSignatureImageValue(SIGNATURE_IMAGE_PREFIX), false, 'empty payload');
  });

  it('rejects a value over the character cap and an image over the byte cap', () => {
    const tooLong = SIGNATURE_IMAGE_PREFIX + 'A'.repeat(SIGNATURE_IMAGE_HOST_MAX_CHARS);
    assert.equal(isValidSignatureImageValue(tooLong), false, 'over 300,000 characters');
    // 230,000 bytes decode from about 306,668 characters, so use a value just under the character cap but over the byte cap
    const bigBytes = Buffer.concat([pngBytes(100, 50), Buffer.alloc(221000)]);
    const url = dataUrl(bigBytes);
    assert.ok(url.length <= SIGNATURE_IMAGE_HOST_MAX_CHARS, 'the fixture itself is under the character cap');
    assert.equal(isValidSignatureImageValue(url), false, 'decoded size over 220,000 bytes');
  });
});

describe('signature images: array validation mirrors the host rules', () => {
  const ok = dataUrl(pngBytes(100, 50));
  const arr = (...items) => JSON.stringify(items);

  it('accepts 1..8 elements of default | valid PNG, default at most once', () => {
    assert.equal(isValidSignatureImageValue(arr('default', ok)), true);
    assert.equal(isValidSignatureImageValue(arr(ok)), true);
    assert.equal(isValidSignatureImageValue(arr('default')), true);
    assert.equal(isValidSignatureImageValue(arr(...Array(MAX_SIGNATURE_IMAGES).fill(ok))), true, 'exactly 8 (duplicates of a custom image are allowed)');
  });

  it('rejects bad JSON, non-arrays, empty, more than 8, duplicate default, non-strings and bad elements', () => {
    assert.equal(isValidSignatureImageValue('[not json'), false, 'bad JSON');
    assert.equal(isValidSignatureImageValue('["default",'), false);
    assert.equal(isValidSignatureImageValue('[]'), false, 'an empty array (use none)');
    assert.equal(isValidSignatureImageValue(arr(...Array(MAX_SIGNATURE_IMAGES + 1).fill(ok))), false, 'more than 8');
    assert.equal(isValidSignatureImageValue(arr('default', 'default')), false, 'duplicate default');
    assert.equal(isValidSignatureImageValue('[1]'), false, 'non-string element');
    assert.equal(isValidSignatureImageValue(JSON.stringify([ok, null])), false);
    assert.equal(isValidSignatureImageValue(JSON.stringify([ok, { a: 1 }])), false);
    assert.equal(isValidSignatureImageValue(arr('none')), false, "'none' is not an element");
    assert.equal(isValidSignatureImageValue(arr('')), false, 'empty element');
    assert.equal(isValidSignatureImageValue(arr(ok, 'data:image/jpeg;base64,' + pngBytes(1, 1).toString('base64'))), false, 'bad prefix');
    assert.equal(isValidSignatureImageValue(arr(ok, dataUrl(pngBytes(SIGNATURE_IMAGE_HOST_MAX_WIDTH + 1, 10)))), false, 'oversize element');
    assert.equal(isValidSignatureImageValue(arr(ok, SIGNATURE_IMAGE_PREFIX + 'A'.repeat(40) + '!')), false, 'bad base64 element');
    assert.equal(isValidSignatureImageValue(arr(ok, 'default') + ' '), false, 'trailing text after the array');
  });

  it('rejects a list over the total length cap even when every element is valid', () => {
    const big = dataUrl(Buffer.concat([pngBytes(100, 50), Buffer.alloc(160000)]));
    assert.ok(big.length < SIGNATURE_IMAGE_HOST_MAX_CHARS, 'each element is valid on its own');
    assert.equal(isValidSignatureImageValue(arr(big, big, big)), true, 'under the cap');
    const list = arr(...Array(6).fill(big));
    assert.ok(list.length > SIGNATURE_IMAGE_LIST_MAX_CHARS);
    assert.equal(isValidSignatureImageValue(list), false, 'total over 900,000 characters');
  });
});

describe('signature image: contrast curve, white compositing, crop and size math', () => {
  it('curve: dark -> black, light -> white, linear in between', () => {
    assert.equal(signatureCurve(0), 0);
    assert.equal(signatureCurve(89), 0);
    assert.equal(signatureCurve(90), 0);
    assert.equal(signatureCurve(201), 255);
    assert.equal(signatureCurve(255), 255);
    assert.equal(signatureCurve(145), Math.round((55 * 255) / 110));
    let previous = -1;
    for (let v = 0; v <= 255; v++) {
      const out = signatureCurve(v);
      assert.ok(out >= previous && out >= 0 && out <= 255, `monotonic at ${v}`);
      previous = out;
    }
  });

  it('a red heart prints dark: luma of pure red goes to black after the curve', () => {
    const redLuma = whiteCompositeLuma(220, 30, 40, 255);
    assert.ok(redLuma < 90, `red luma ${redLuma}`);
    assert.equal(signatureCurve(redLuma), 0);
  });

  it('transparent pixels become white, half transparent black becomes mid grey', () => {
    assert.equal(whiteCompositeLuma(0, 0, 0, 0), 255);
    assert.equal(whiteCompositeLuma(0, 0, 0, 255), 0);
    assert.equal(whiteCompositeLuma(0, 0, 0, 128), 127);
  });

  it('bounding box of dark pixels plus padding, clamped to the image', () => {
    const w = 20;
    const h = 10;
    const gray = new Uint8Array(w * h).fill(255);
    gray[3 * w + 5] = 0;
    gray[6 * w + 12] = 50;
    assert.deepEqual(findContentBounds(gray, w, h, 200, 2), { x: 3, y: 1, width: 12, height: 8 });
    assert.deepEqual(findContentBounds(gray, w, h, 200, 0), { x: 5, y: 3, width: 8, height: 4 });
    const edge = new Uint8Array(w * h).fill(255);
    edge[0] = 0;
    assert.deepEqual(findContentBounds(edge, w, h, 200, 4), { x: 0, y: 0, width: 5, height: 5 }, 'clamped at the corner');
    assert.equal(findContentBounds(new Uint8Array(w * h).fill(255), w, h), null, 'a white image has no content');
    assert.equal(findContentBounds(new Uint8Array(w * h).fill(199), w, h)?.width, w, 'threshold is exclusive of 200');
  });

  it('size: never upscaled, width <= 900 and height <= 300, aspect kept', () => {
    assert.deepEqual(fitSignatureSize(300, 100), { width: 300, height: 100 });
    assert.deepEqual(fitSignatureSize(1800, 276), { width: 900, height: 138 });
    assert.deepEqual(fitSignatureSize(900, 900), { width: 300, height: 300 });
    assert.deepEqual(fitSignatureSize(1800, 276, 700), { width: 700, height: 107 });
    const tiny = fitSignatureSize(1, 5000);
    assert.ok(tiny.width >= 1 && tiny.height <= 300);
  });
});
