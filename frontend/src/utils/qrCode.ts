/**
 * Standalone ISO/IEC 18004 QR Code Generator (Zero Dependencies)
 * Produces crisp, high-contrast 2D boolean matrices and SVG paths for thermal receipts and live preview.
 */

export type QrEccLevel = 'L' | 'M' | 'Q' | 'H';

const FORMAT_BITS: Record<QrEccLevel, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

const ECC_ORDINALS: Record<QrEccLevel, number> = {
  L: 0,
  M: 1,
  Q: 2,
  H: 3,
};

const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  // L
  [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // M
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // Q
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // H
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  // L
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // M
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // Q
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // H
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

// Galois Field GF(256) tables
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11D : 0);
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

class ReedSolomonGenerator {
  private coefficients: Uint8Array;

  constructor(degree: number) {
    const root = [1];
    for (let i = 0; i < degree; i++) {
      root.push(0);
      for (let j = root.length - 1; j >= 1; j--) {
        root[j] = gfMultiply(root[j], EXP_TABLE[i]) ^ root[j - 1];
      }
      root[0] = gfMultiply(root[0], EXP_TABLE[i]);
    }
    this.coefficients = new Uint8Array(root.reverse());
  }

  getRemainder(data: Uint8Array): Uint8Array {
    const deg = this.coefficients.length - 1;
    const result = new Uint8Array(deg);
    for (let d = 0; d < data.length; d++) {
      const factor = data[d] ^ result[0];
      for (let i = 0; i < deg - 1; i++) result[i] = result[i + 1];
      result[deg - 1] = 0;
      for (let i = 0; i < deg; i++) {
        result[i] ^= gfMultiply(this.coefficients[i], factor);
      }
    }
    return result;
  }
}

function appendBits(val: number, len: number, bb: number[]): void {
  for (let i = len - 1; i >= 0; i--) {
    bb.push((val >>> i) & 1);
  }
}

function getCharCountBits(ver: number): number {
  return (ver + 7) / 17 < 1 ? 8 : 16;
}

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number, ecl: QrEccLevel): number {
  const ord = ECC_ORDINALS[ecl];
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ord][ver] * NUM_ERROR_CORRECTION_BLOCKS[ord][ver]
  );
}

function getAlignmentPatternPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function setFunctionModule(
  x: number,
  y: number,
  isDark: boolean,
  modules: boolean[][],
  isFunction: boolean[][]
): void {
  modules[y][x] = isDark;
  isFunction[y][x] = true;
}

function drawFinderPattern(
  x: number,
  y: number,
  size: number,
  modules: boolean[][],
  isFunction: boolean[][]
): void {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) {
        setFunctionModule(xx, yy, dist !== 2 && dist !== 4, modules, isFunction);
      }
    }
  }
}

function drawAlignmentPattern(
  x: number,
  y: number,
  modules: boolean[][],
  isFunction: boolean[][]
): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(x + dx, y + dy, dist !== 1, modules, isFunction);
    }
  }
}

function drawFormatBits(
  size: number,
  ecl: QrEccLevel,
  mask: number,
  modules: boolean[][],
  isFunction: boolean[][]
): void {
  const data = (FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, ((bits >>> i) & 1) !== 0, modules, isFunction);
  setFunctionModule(8, 7, ((bits >>> 6) & 1) !== 0, modules, isFunction);
  setFunctionModule(8, 8, ((bits >>> 7) & 1) !== 0, modules, isFunction);
  setFunctionModule(7, 8, ((bits >>> 8) & 1) !== 0, modules, isFunction);
  for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, ((bits >>> i) & 1) !== 0, modules, isFunction);

  for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, ((bits >>> i) & 1) !== 0, modules, isFunction);
  for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, ((bits >>> i) & 1) !== 0, modules, isFunction);
  setFunctionModule(8, size - 8, true, modules, isFunction); // Dark module
}

function drawVersion(
  ver: number,
  size: number,
  modules: boolean[][],
  isFunction: boolean[][]
): void {
  if (ver < 7) return;
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (ver << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunctionModule(a, b, bit, modules, isFunction);
    setFunctionModule(b, a, bit, modules, isFunction);
  }
}

function addEccAndInterleave(ver: number, ecl: QrEccLevel, data: Uint8Array): Uint8Array {
  const ord = ECC_ORDINALS[ecl];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ord][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ord][ver];
  const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocksData: Uint8Array[] = [];
  const blocksEcc: Uint8Array[] = [];
  const rs = new ReedSolomonGenerator(blockEccLen);

  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i >= numShortBlocks ? 1 : 0);
    const dat = data.slice(k, k + datLen);
    k += datLen;
    const ecc = rs.getRemainder(dat);
    blocksData.push(dat);
    blocksEcc.push(ecc);
  }

  const result = new Uint8Array(rawCodewords);
  let idx = 0;
  for (let i = 0; i < shortBlockLen - blockEccLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i < blocksData[j].length) {
        result[idx++] = blocksData[j][i];
      }
    }
  }
  for (let i = 0; i < blockEccLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      result[idx++] = blocksEcc[j][i];
    }
  }
  return result;
}

function drawCodewords(
  size: number,
  data: Uint8Array,
  modules: boolean[][],
  isFunction: boolean[][]
): void {
  let i = 0;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < data.length * 8) {
          modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function applyMask(size: number, mask: number, modules: boolean[][], isFunction: boolean[][]): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert = false;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

function getPenaltyScore(size: number, modules: boolean[][]): number {
  let result = 0;
  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runVal = 0;
    for (let x = 0; x < size; x++) {
      if (x === 0 || modules[y][x] !== runColor) {
        runColor = modules[y][x];
        runVal = 1;
      } else {
        runVal++;
        if (runVal === 5) result += 3;
        else if (runVal > 5) result += 1;
      }
    }
  }
  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runVal = 0;
    for (let y = 0; y < size; y++) {
      if (y === 0 || modules[y][x] !== runColor) {
        runColor = modules[y][x];
        runVal = 1;
      } else {
        runVal++;
        if (runVal === 5) result += 3;
        else if (runVal > 5) result += 1;
      }
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x];
      if (
        color === modules[y][x + 1] &&
        color === modules[y + 1][x] &&
        color === modules[y + 1][x + 1]
      ) {
        result += 3;
      }
    }
  }
  let totalDark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) totalDark++;
    }
  }
  const total = size * size;
  const k = Math.floor(Math.abs(totalDark * 20 - total * 10) / total);
  result += k * 10;
  return result;
}

/**
 * Encodes text into a standard QR code boolean matrix (rows x cols).
 * true = dark module, false = light module.
 */
export function encodeQrMatrix(text: string, ecl: QrEccLevel = 'M'): boolean[][] | null {
  if (!text) return null;
  const data = new TextEncoder().encode(text);
  if (data.length === 0) return null;

  const bitData: number[] = [];
  for (const b of data) {
    for (let i = 7; i >= 0; i--) {
      bitData.push((b >>> i) & 1);
    }
  }

  for (let ver = 1; ver <= 40; ver++) {
    const dataCapacityBits = getNumDataCodewords(ver, ecl) * 8;
    const ccBits = getCharCountBits(ver);
    if (data.length >= (1 << ccBits)) continue;
    const totalBits = 4 + ccBits + bitData.length;
    if (totalBits <= dataCapacityBits) {
      // Build data bitstream
      const bb: number[] = [];
      appendBits(0x4, 4, bb); // Byte mode
      appendBits(data.length, ccBits, bb);
      for (const bit of bitData) bb.push(bit);

      // Terminator
      const termLen = Math.min(4, dataCapacityBits - bb.length);
      appendBits(0, termLen, bb);

      // Pad to byte
      while (bb.length % 8 !== 0) bb.push(0);

      // Pad bytes
      const padBytes = [0xec, 0x11];
      for (let i = 0; bb.length < dataCapacityBits; i++) {
        appendBits(padBytes[i % 2], 8, bb);
      }

      // Convert to bytes
      const dataCodewords = new Uint8Array(bb.length / 8);
      for (let i = 0; i < bb.length; i += 8) {
        let byteVal = 0;
        for (let j = 0; j < 8; j++) byteVal = (byteVal << 1) | bb[i + j];
        dataCodewords[i / 8] = byteVal;
      }

      const size = ver * 4 + 17;
      const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
      const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

      // Draw function patterns
      drawFinderPattern(0, 0, size, modules, isFunction);
      drawFinderPattern(size - 7, 0, size, modules, isFunction);
      drawFinderPattern(0, size - 7, size, modules, isFunction);

      for (let i = 0; i < size; i++) {
        setFunctionModule(6, i, i % 2 === 0, modules, isFunction);
        setFunctionModule(i, 6, i % 2 === 0, modules, isFunction);
      }

      const alignPos = getAlignmentPatternPositions(ver);
      for (let i = 0; i < alignPos.length; i++) {
        for (let j = 0; j < alignPos.length; j++) {
          if (
            (i === 0 && j === 0) ||
            (i === 0 && j === alignPos.length - 1) ||
            (i === alignPos.length - 1 && j === 0)
          ) {
            continue;
          }
          drawAlignmentPattern(alignPos[i], alignPos[j], modules, isFunction);
        }
      }

      drawFormatBits(size, ecl, 0, modules, isFunction);
      drawVersion(ver, size, modules, isFunction);

      // Add ECC & Draw
      const allCodewords = addEccAndInterleave(ver, ecl, dataCodewords);
      drawCodewords(size, allCodewords, modules, isFunction);

      // Select optimal mask
      let bestMask = 0;
      let minPenalty = Infinity;
      for (let msk = 0; msk < 8; msk++) {
        applyMask(size, msk, modules, isFunction);
        drawFormatBits(size, ecl, msk, modules, isFunction);
        const penalty = getPenaltyScore(size, modules);
        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestMask = msk;
        }
        applyMask(size, msk, modules, isFunction);
      }

      applyMask(size, bestMask, modules, isFunction);
      drawFormatBits(size, ecl, bestMask, modules, isFunction);
      return modules;
    }
  }

  return null;
}

/**
 * Builds an SVG path `d` string that draws all dark modules as 1x1 units.
 * With quietZone modules added around the matrix, viewBox becomes 0 0 (size + 2*quietZone) (size + 2*quietZone).
 */
export function buildQrSvgPath(matrix: boolean[][], quietZone = 2): { path: string; totalSize: number } {
  const size = matrix.length;
  const totalSize = size + quietZone * 2;
  const parts: string[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix[y][x]) {
        parts.push(`M${x + quietZone},${y + quietZone}h1v1h-1z`);
      }
    }
  }

  return { path: parts.join(''), totalSize };
}
