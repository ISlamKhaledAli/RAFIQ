import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeQrMatrix, buildQrSvgPath } from '../src/utils/qrCode.ts';

test('QR Code generator: null or empty returns null', () => {
  assert.equal(encodeQrMatrix(''), null);
  assert.equal(encodeQrMatrix(null), null);
});

test('QR Code generator: encodes online store URL into version 4 (33x33) with ECC M', () => {
  const url = 'https://store.rafiqpos.workers.dev/shop-01234567';
  const matrix = encodeQrMatrix(url, 'M');
  assert.ok(matrix, 'matrix is generated');
  assert.equal(matrix.length, 33, 'Version 4 is 33x33 modules');
  assert.equal(matrix[0].length, 33);

  // Top-left finder pattern
  assert.equal(matrix[0][0], true, 'top-left outer dark');
  assert.equal(matrix[0][6], true);
  assert.equal(matrix[6][0], true);
  assert.equal(matrix[6][6], true);

  // Top-left finder inner white ring
  assert.equal(matrix[1][1], false);
  assert.equal(matrix[1][5], false);
  assert.equal(matrix[5][1], false);
  assert.equal(matrix[5][5], false);

  // Top-left finder inner dark 3x3
  assert.equal(matrix[2][2], true);
  assert.equal(matrix[3][3], true);
  assert.equal(matrix[4][4], true);

  // Separator
  assert.equal(matrix[7][0], false);
  assert.equal(matrix[7][7], false);
  assert.equal(matrix[0][7], false);

  // Timing patterns
  for (let i = 8; i < 33 - 8; i++) {
    const expected = i % 2 === 0;
    assert.equal(matrix[6][i], expected, `horizontal timing at col ${i}`);
    assert.equal(matrix[i][6], expected, `vertical timing at row ${i}`);
  }

  // Dark module
  assert.equal(matrix[33 - 8][8], true, 'dark module at (size-8, 8)');
});

test('QR Code SVG path builder: generates valid path and correct quiet zone bounds', () => {
  const url = 'https://store.rafiqpos.workers.dev/test-shop';
  const matrix = encodeQrMatrix(url, 'M');
  assert.ok(matrix);

  const { path, totalSize } = buildQrSvgPath(matrix, 2);
  assert.equal(totalSize, matrix.length + 4);
  assert.ok(path.startsWith('M'), 'path begins with M command');
  assert.ok(path.includes('h1v1h-1z'), 'draws 1x1 rects');
});
