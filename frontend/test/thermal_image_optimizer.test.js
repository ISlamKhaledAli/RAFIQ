import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculatePerceivedLuma,
  findLogoContentBounds,
  fitThermalLogoDimensions,
  transformThermalPixel,
  applyFloydSteinbergDither,
  detectImageComplexity,
  autoLevelPixels,
  THERMAL_LOGO_MAX_WIDTH,
  THERMAL_LOGO_MAX_HEIGHT,
  THERMAL_LUMA_DARK_THRESHOLD,
  THERMAL_LUMA_LIGHT_THRESHOLD,
} from '../src/utils/thermalImageOptimizer.ts';

describe('Thermal Image Optimizer: High-contrast monochrome & anti-aliasing engine', () => {
  it('calculatePerceivedLuma: computes ITU-R BT.601 luminance composited on white', () => {
    // Solid colors
    assert.equal(calculatePerceivedLuma(0, 0, 0, 255), 0, 'Pure black has 0 luma');
    assert.equal(calculatePerceivedLuma(255, 255, 255, 255), 255, 'Pure white has 255 luma');

    // Transparent pixel composited on white becomes pure white (255)
    assert.equal(calculatePerceivedLuma(0, 0, 0, 0), 255, 'Fully transparent pixel becomes 255 on white');
    assert.equal(calculatePerceivedLuma(255, 255, 255, 0), 255, 'Transparent white is 255');

    // Colored pixels: red, blue, green have low/mid perceived luma
    const redLuma = calculatePerceivedLuma(255, 0, 0, 255);
    assert.ok(redLuma >= 75 && redLuma <= 78, `Red luma ~76 (got ${redLuma})`);

    const blueLuma = calculatePerceivedLuma(0, 0, 255, 255);
    assert.ok(blueLuma >= 28 && blueLuma <= 30, `Blue luma ~29 (got ${blueLuma})`);

    const greenLuma = calculatePerceivedLuma(0, 255, 0, 255);
    assert.ok(greenLuma >= 148 && greenLuma <= 152, `Green luma ~150 (got ${greenLuma})`);
  });

  it('fitThermalLogoDimensions: maintains aspect ratio and never upscales small images', () => {
    // 1. Square logo: constrained by max height (220) to ensure high-density supersampling
    const square = fitThermalLogoDimensions(1000, 1000);
    assert.equal(square.width, THERMAL_LOGO_MAX_HEIGHT);
    assert.equal(square.height, THERMAL_LOGO_MAX_HEIGHT);
    assert.equal(square.width, 220);

    // 2. Wide banner logo (3:1 aspect ratio)
    const wide = fitThermalLogoDimensions(1200, 400);
    assert.equal(wide.width, THERMAL_LOGO_MAX_WIDTH);
    assert.equal(wide.height, Math.round(400 * (THERMAL_LOGO_MAX_WIDTH / 1200)));
    assert.equal(wide.width, 550);
    assert.equal(wide.height, 183);

    // 3. Small image (120x60): must NEVER be upscaled (scale capped at 1)
    const small = fitThermalLogoDimensions(120, 60);
    assert.equal(small.width, 120);
    assert.equal(small.height, 60);

    // 4. Zero / negative dimensions handled safely
    const zero = fitThermalLogoDimensions(0, 0);
    assert.ok(zero.width > 0 && zero.height > 0);
  });

  it('findLogoContentBounds: detects non-blank content and crops empty outer margins', () => {
    const width = 20;
    const height = 20;
    const pixels = new Uint8ClampedArray(width * height * 4);

    // Fill all pixels with white background (255, 255, 255, 255)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }

    // Pure white image should return null (no content found)
    assert.equal(findLogoContentBounds(pixels, width, height), null);

    // Place a small 4x4 black box at x: 8..11, y: 8..11
    for (let y = 8; y <= 11; y++) {
      for (let x = 8; x <= 11; x++) {
        const idx = (y * width + x) * 4;
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 255;
      }
    }

    const bounds = findLogoContentBounds(pixels, width, height, 235, 25, 2);
    assert.ok(bounds !== null, 'Bounds must be detected');
    assert.ok(bounds.x <= 8, 'Cropped X includes padding');
    assert.ok(bounds.y <= 8, 'Cropped Y includes padding');
    assert.ok(bounds.width >= 4, 'Cropped width covers content');
    assert.ok(bounds.height >= 4, 'Cropped height covers content');
  });

  it('transformThermalPixel: converts dark content to crisp black, white to transparent, and preserves smooth edges', () => {
    // 1. Deep black -> pure crisp solid black
    const black = transformThermalPixel(0, 0, 0, 255, THERMAL_LUMA_DARK_THRESHOLD, THERMAL_LUMA_LIGHT_THRESHOLD);
    assert.deepEqual(black, { r: 0, g: 0, b: 0, a: 255 });

    // 2. Pure white -> completely transparent (never leaves dirty thermal background)
    const white = transformThermalPixel(255, 255, 255, 255);
    assert.equal(white.a, 0, 'White background becomes transparent');

    // 3. Fully transparent pixel -> stays transparent
    const transparent = transformThermalPixel(0, 0, 0, 0);
    assert.equal(transparent.a, 0, 'Transparent remains transparent');

    // 4. Colored logos (Red / Blue) -> converted to pure black because their luminance is <= 140
    const red = transformThermalPixel(255, 0, 0, 255);
    assert.deepEqual(red, { r: 0, g: 0, b: 0, a: 255 }, 'Red logo icon converts to solid black');

    const blue = transformThermalPixel(0, 0, 255, 255);
    assert.deepEqual(blue, { r: 0, g: 0, b: 0, a: 255 }, 'Blue logo text converts to solid black');

    // 5. Anti-aliased edge pixel (smooth transition without stair-stepping)
    const midGrey = transformThermalPixel(180, 180, 180, 255);
    assert.equal(midGrey.r, 0);
    assert.equal(midGrey.g, 0);
    assert.equal(midGrey.b, 0);
    assert.ok(midGrey.a > 0 && midGrey.a < 255, `Edge pixel has smooth intermediate alpha (got ${midGrey.a})`);
  });

  it('applyFloydSteinbergDither: creates balanced halftone dots and preserves gradients without black blobs', () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);

    // Fill with 50% gray
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 128;
      pixels[i + 1] = 128;
      pixels[i + 2] = 128;
      pixels[i + 3] = 255;
    }

    applyFloydSteinbergDither(pixels, width, height, 1.0);

    let blackCount = 0;
    let whiteCount = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 255 && pixels[i] === 0) blackCount++;
      if (pixels[i + 3] === 0) whiteCount++;
    }

    const total = width * height;
    assert.equal(blackCount + whiteCount, total, 'Every pixel is strictly either 1-bit black or transparent');
    // For 50% gray, black dots should be approx 45-55%
    const blackRatio = blackCount / total;
    assert.ok(blackRatio >= 0.4 && blackRatio <= 0.6, `Black ratio around 50% (got ${blackRatio})`);
  });

  it('detectImageComplexity: distinguishes crisp line-art from shaded gradients', () => {
    const width = 10;
    const height = 10;
    const lineArtPixels = new Uint8ClampedArray(width * height * 4);
    // Line art: almost all pure black or pure white
    for (let i = 0; i < lineArtPixels.length; i += 4) {
      const isBlack = i % 8 === 0;
      lineArtPixels[i] = isBlack ? 0 : 255;
      lineArtPixels[i + 1] = isBlack ? 0 : 255;
      lineArtPixels[i + 2] = isBlack ? 0 : 255;
      lineArtPixels[i + 3] = 255;
    }
    assert.equal(detectImageComplexity(lineArtPixels, width, height), 'crisp');

    // Gradient / Photo: lots of midtones
    const gradientPixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < gradientPixels.length; i += 4) {
      const shade = Math.round(((i / 4) / (width * height)) * 255);
      gradientPixels[i] = shade;
      gradientPixels[i + 1] = shade;
      gradientPixels[i + 2] = shade;
      gradientPixels[i + 3] = 255;
    }
    assert.equal(detectImageComplexity(gradientPixels, width, height), 'dither');
  });

  it('autoLevelPixels: cleans off-white camera backgrounds and expands dynamic range', () => {
    const width = 5;
    const height = 5;
    const pixels = new Uint8ClampedArray(width * height * 4);

    // Simulate dirty camera background: background is 220, dark text is 40
    for (let i = 0; i < pixels.length; i += 4) {
      const isText = i === 12 * 4; // one pixel of text
      const luma = isText ? 40 : 220;
      pixels[i] = luma;
      pixels[i + 1] = luma;
      pixels[i + 2] = luma;
      pixels[i + 3] = 255;
    }

    autoLevelPixels(pixels, width, height, 0.0, 0.9);

    // Background should become pure white/transparent (a=0)
    assert.equal(pixels[3], 0, 'Off-white background clamped to transparent');
  });

  it('receipt layout invariant: physical receipt bounding boxes in C# and Frontend match strictly', () => {
    const receiptPaperPath = fs.existsSync(path.resolve('src', 'components', 'ReceiptPaper.tsx'))
      ? path.resolve('src', 'components', 'ReceiptPaper.tsx')
      : path.resolve('frontend', 'src', 'components', 'ReceiptPaper.tsx');

    const printerServicePath = fs.existsSync(path.resolve('..', 'desktop', 'Services', 'PrinterService.cs'))
      ? path.resolve('..', 'desktop', 'Services', 'PrinterService.cs')
      : path.resolve('desktop', 'Services', 'PrinterService.cs');

    const receiptPaper = fs.readFileSync(receiptPaperPath, 'utf8');
    assert.ok(receiptPaper.includes("max-h-[48px]"), 'Frontend clamps 80mm height to 48px');
    assert.ok(receiptPaper.includes("max-w-[130px]"), 'Frontend clamps 80mm width to 130px');
    assert.ok(receiptPaper.includes("max-w-[90px]"), 'Frontend clamps 57mm width to 90px');

    const printerService = fs.readFileSync(printerServicePath, 'utf8');
    assert.ok(printerService.includes('float maxW = p.Compact ? 90f : 130f;'), 'C# matches 130f / 90f max width');
    assert.ok(printerService.includes('float maxH = p.Compact ? 38f : 48f;'), 'C# matches 48f / 38f max height');
    assert.ok(printerService.includes('p.Y += drawH + 3f;'), 'C# advances Y strictly by drawH + 3f');
  });
});
