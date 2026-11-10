/**
 * Pure mathematical and image processing functions for thermal receipt logos (ESC/POS 203 DPI)
 * Ensures high contrast, zero pixelation, automatic margin trimming, and smooth anti-aliased edges.
 * Supports both Crisp Vector/Text mode and High-Fidelity Floyd-Steinberg Dithering for photos and shaded emblems.
 */

export const THERMAL_LOGO_MAX_WIDTH = 550;
export const THERMAL_LOGO_MAX_HEIGHT = 220;
export const THERMAL_LUMA_DARK_THRESHOLD = 140;
export const THERMAL_LUMA_LIGHT_THRESHOLD = 238;
export const THERMAL_CROP_PADDING = 4;

export type ThermalOptimizeMode = 'crisp' | 'dither';

export interface ThermalOptimizeOptions {
  mode?: ThermalOptimizeMode;
  maxWidth?: number;
  maxHeight?: number;
  cleanBackground?: boolean;
  gamma?: number;
}

/**
 * Calculates perceived luminance (ITU-R BT.601) composited over a solid white background.
 * Transparent pixels (a = 0) yield white (255).
 */
export function calculatePerceivedLuma(r: number, g: number, b: number, a: number): number {
  const alphaRatio = Math.max(0, Math.min(255, a)) / 255;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return Math.round(luma * alphaRatio + 255 * (1 - alphaRatio));
}

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds the tight bounding box of non-blank content (pixels darker than lumaThreshold with alpha > alphaThreshold).
 * Trims empty outer borders while keeping a small padding. Returns null if image is entirely blank.
 */
export function findLogoContentBounds(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  lumaThreshold = 235,
  alphaThreshold = 25,
  padding = THERMAL_CROP_PADDING,
): ContentBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const a = pixels[idx + 3];
      if (a < alphaThreshold) continue;

      const luma = calculatePerceivedLuma(pixels[idx], pixels[idx + 1], pixels[idx + 2], a);
      if (luma < lumaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  const croppedX = Math.max(0, minX - padding);
  const croppedY = Math.max(0, minY - padding);
  const croppedW = Math.min(width, maxX + padding + 1) - croppedX;
  const croppedH = Math.min(height, maxY + padding + 1) - croppedY;

  return { x: croppedX, y: croppedY, width: croppedW, height: croppedH };
}

/**
 * Computes proportional target dimensions preserving aspect ratio.
 * Never upscales images that are already smaller than the bounding box.
 */
export function fitThermalLogoDimensions(
  origW: number,
  origH: number,
  maxW = THERMAL_LOGO_MAX_WIDTH,
  maxH = THERMAL_LOGO_MAX_HEIGHT,
): { width: number; height: number } {
  if (origW <= 0 || origH <= 0) {
    return { width: Math.max(1, maxW), height: Math.max(1, maxH) };
  }
  const scale = Math.min(1, maxW / origW, maxH / origH);
  return {
    width: Math.max(1, Math.round(origW * scale)),
    height: Math.max(1, Math.round(origH * scale)),
  };
}

/**
 * Transforms an individual pixel into high-contrast monochrome with smooth anti-aliased alpha edges.
 * White or light backgrounds become fully transparent (alpha = 0).
 * Dark elements become crisp solid black (RGB = 0,0,0, alpha = 255).
 * Edge pixels receive smooth proportional alpha for flawless bicubic downsampling without stair-stepping.
 */
export function transformThermalPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  darkThreshold = THERMAL_LUMA_DARK_THRESHOLD,
  lightThreshold = THERMAL_LUMA_LIGHT_THRESHOLD,
): { r: number; g: number; b: number; a: number } {
  if (a < 15) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const effectiveLuma = calculatePerceivedLuma(r, g, b, a);

  // White or near-white background -> completely transparent
  if (effectiveLuma >= lightThreshold) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Solid dark content -> pure solid black
  if (effectiveLuma <= darkThreshold) {
    return { r: 0, g: 0, b: 0, a: 255 };
  }

  // Anti-aliased transition edge (darkThreshold < effectiveLuma < lightThreshold)
  const span = lightThreshold - darkThreshold;
  const normalized = (lightThreshold - effectiveLuma) / span;
  const curve = Math.pow(normalized, 1.15);
  let targetAlpha = Math.round(255 * curve);

  if (a < 255) {
    targetAlpha = Math.round(targetAlpha * (a / 255));
  }

  return {
    r: 0,
    g: 0,
    b: 0,
    a: Math.max(0, Math.min(255, targetAlpha)),
  };
}

/**
 * Detects whether an image is predominantly sharp line-art/text or has rich gradients/photos.
 * Returns 'dither' if significant midtone variety is detected, otherwise 'crisp'.
 */
export function detectImageComplexity(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): ThermalOptimizeMode {
  let midtones = 0;
  let totalNonWhite = 0;
  const step = Math.max(1, Math.floor((width * height) / 1000));

  for (let i = 0; i < pixels.length; i += 4 * step) {
    const a = pixels[i + 3];
    if (a < 20) continue;
    const luma = calculatePerceivedLuma(pixels[i], pixels[i + 1], pixels[i + 2], a);
    if (luma < 240) {
      totalNonWhite++;
      if (luma >= 45 && luma <= 215) {
        midtones++;
      }
    }
  }

  if (totalNonWhite === 0) return 'crisp';
  const ratio = midtones / totalNonWhite;
  return ratio > 0.18 ? 'dither' : 'crisp';
}

/**
 * Linear dynamic-range stretching and auto-white leveling.
 * Removes camera shadows, dirty phone photo off-white backgrounds, and ensures crisp black text.
 */
export function autoLevelPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  lowPercentile = 0.03,
  highPercentile = 0.95,
): void {
  const lumas: number[] = [];
  const step = Math.max(1, Math.floor((width * height) / 800));

  for (let i = 0; i < pixels.length; i += 4 * step) {
    const a = pixels[i + 3];
    if (a < 20) continue;
    lumas.push(calculatePerceivedLuma(pixels[i], pixels[i + 1], pixels[i + 2], a));
  }

  if (lumas.length < 20) return;
  lumas.sort((x, y) => x - y);

  const minVal = lumas[Math.floor(lumas.length * lowPercentile)] ?? 0;
  const maxVal = lumas[Math.floor(lumas.length * highPercentile)] ?? 255;

  // Only stretch if there is a real range and background is sufficiently light
  if (maxVal <= minVal || maxVal < 185) return;
  const range = maxVal - minVal;

  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 15) continue;
    const origLuma = calculatePerceivedLuma(pixels[i], pixels[i + 1], pixels[i + 2], a);

    // If already darker than minVal, clamp to pure black
    if (origLuma <= minVal) {
      pixels[i] = 0;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
    } else if (origLuma >= maxVal) {
      // Clamped to pure white/transparent
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 0;
    } else {
      const stretched = Math.round(((origLuma - minVal) / range) * 255);
      pixels[i] = stretched;
      pixels[i + 1] = stretched;
      pixels[i + 2] = stretched;
    }
  }
}

/**
 * High-fidelity Floyd-Steinberg error diffusion dithering with dot-gain gamma correction.
 * Transmutes complex multi-tone logos, photos, and gradients into crisp binary halftone dot patterns.
 */
export function applyFloydSteinbergDither(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  gamma = 1.2,
): void {
  const total = width * height;
  const lumaBuffer = new Float32Array(total);
  const errorBuffer = new Float32Array(total);
  const invGamma = 1 / Math.max(0.5, Math.min(2.5, gamma));

  // 1. Compute gamma-corrected luminance for each pixel
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const pIdx = (rowOffset + x) * 4;
      const a = pixels[pIdx + 3];

      if (a < 15) {
        lumaBuffer[rowOffset + x] = 255;
        continue;
      }

      const luma = calculatePerceivedLuma(pixels[pIdx], pixels[pIdx + 1], pixels[pIdx + 2], a);
      if (luma >= 254) {
        lumaBuffer[rowOffset + x] = 255;
      } else if (luma <= 5) {
        lumaBuffer[rowOffset + x] = 0;
      } else {
        // Gamma compensation to account for thermal dot expansion
        lumaBuffer[rowOffset + x] = 255 * Math.pow(luma / 255, invGamma);
      }
    }
  }

  // 2. Perform error diffusion across the 2D matrix
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const pIdx = idx * 4;
      const a = pixels[pIdx + 3];

      if (a < 15) {
        pixels[pIdx] = 0;
        pixels[pIdx + 1] = 0;
        pixels[pIdx + 2] = 0;
        pixels[pIdx + 3] = 0;
        continue;
      }

      const currentVal = Math.max(0, Math.min(255, lumaBuffer[idx] + errorBuffer[idx]));
      const bit = currentVal < 128 ? 0 : 255;

      if (bit === 0) {
        // Solid black thermal dot
        pixels[pIdx] = 0;
        pixels[pIdx + 1] = 0;
        pixels[pIdx + 2] = 0;
        pixels[pIdx + 3] = 255;
      } else {
        // Pure transparent / paper white
        pixels[pIdx] = 0;
        pixels[pIdx + 1] = 0;
        pixels[pIdx + 2] = 0;
        pixels[pIdx + 3] = 0;
      }

      const err = currentVal - bit;

      // Distribute error to neighboring pixels (Floyd-Steinberg kernel)
      if (x + 1 < width) {
        errorBuffer[idx + 1] += err * (7 / 16);
      }
      if (y + 1 < height) {
        const nextRow = (y + 1) * width;
        if (x > 0) {
          errorBuffer[nextRow + (x - 1)] += err * (3 / 16);
        }
        errorBuffer[nextRow + x] += err * (5 / 16);
        if (x + 1 < width) {
          errorBuffer[nextRow + (x + 1)] += err * (1 / 16);
        }
      }
    }
  }
}

/**
 * Optimizes store logos for thermal receipt printing (ESC/POS 203 DPI) and high-DPI screen preview.
 * 1. Safe working canvas reduction for ultra-large mobile camera photos (prevents browser freezing).
 * 2. Automatic content margin trimming (crops blank outer borders so the logo fills the receipt properly).
 * 3. Proportional scaling to optimal thermal dimensions (up to 550x220, never stretched or upscaled).
 * 4. High-contrast monochrome conversion or Floyd-Steinberg dithering for maximum detail.
 * 5. Returns a lightweight, high-density PNG data URL.
 */
export function optimizeImageForThermal(
  dataUrlOrSrc: string,
  optionsOrMaxWidth: number | ThermalOptimizeOptions = THERMAL_LOGO_MAX_WIDTH,
  maxHeightParam = THERMAL_LOGO_MAX_HEIGHT,
): Promise<string> {
  const options: ThermalOptimizeOptions =
    typeof optionsOrMaxWidth === 'number'
      ? { maxWidth: optionsOrMaxWidth, maxHeight: maxHeightParam, mode: 'crisp' }
      : (optionsOrMaxWidth ?? {});

  const maxWidth = options.maxWidth ?? THERMAL_LOGO_MAX_WIDTH;
  const maxHeight = options.maxHeight ?? THERMAL_LOGO_MAX_HEIGHT;
  const mode = options.mode ?? 'crisp';
  const cleanBackground = options.cleanBackground ?? true;
  const gamma = options.gamma ?? 1.2;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        if (origW <= 0 || origH <= 0) {
          resolve(dataUrlOrSrc);
          return;
        }

        // 1. Initial working canvas: clamp huge photos (> 2000px) to prevent OOM
        const maxWorkingSide = 2000;
        const workReduce = Math.min(1, maxWorkingSide / Math.max(origW, origH));
        const workW = Math.max(1, Math.round(origW * workReduce));
        const workH = Math.max(1, Math.round(origH * workReduce));

        const workCanvas = document.createElement('canvas');
        workCanvas.width = workW;
        workCanvas.height = workH;
        const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

        if (!workCtx) {
          resolve(dataUrlOrSrc);
          return;
        }

        workCtx.imageSmoothingEnabled = true;
        workCtx.imageSmoothingQuality = 'high';
        workCtx.drawImage(img, 0, 0, workW, workH);

        const workData = workCtx.getImageData(0, 0, workW, workH);
        const bounds = findLogoContentBounds(workData.data, workW, workH) ?? {
          x: 0,
          y: 0,
          width: workW,
          height: workH,
        };

        // 2. Final target dimensions based on actual content bounds
        const targetSize = fitThermalLogoDimensions(bounds.width, bounds.height, maxWidth, maxHeight);
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetSize.width;
        finalCanvas.height = targetSize.height;
        const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });

        if (!finalCtx) {
          resolve(dataUrlOrSrc);
          return;
        }

        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = 'high';
        finalCtx.drawImage(
          workCanvas,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          0,
          0,
          targetSize.width,
          targetSize.height,
        );

        const finalData = finalCtx.getImageData(0, 0, targetSize.width, targetSize.height);
        const pixels = finalData.data;

        // 3. Optional auto-leveling & background cleaning
        if (cleanBackground) {
          autoLevelPixels(pixels, targetSize.width, targetSize.height);
        }

        // 4. Processing mode: Dither or Crisp
        if (mode === 'dither') {
          applyFloydSteinbergDither(pixels, targetSize.width, targetSize.height, gamma);
        } else {
          for (let i = 0; i < pixels.length; i += 4) {
            const transformed = transformThermalPixel(
              pixels[i],
              pixels[i + 1],
              pixels[i + 2],
              pixels[i + 3],
            );
            pixels[i] = transformed.r;
            pixels[i + 1] = transformed.g;
            pixels[i + 2] = transformed.b;
            pixels[i + 3] = transformed.a;
          }
        }

        finalCtx.putImageData(finalData, 0, 0);
        resolve(finalCanvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Thermal optimizer fallback:', err);
        resolve(dataUrlOrSrc);
      }
    };

    img.onerror = () => {
      reject(new Error('تعذر تحميل الصورة لمعالجتها للطباعة الحرارية.'));
    };

    img.src = dataUrlOrSrc;
  });
}

/**
 * Generates an exact 1-bit thermal dot simulation (black dots on white paper)
 * for instant live preview of physical printhead behavior.
 */
export function generateThermal1BitSimulation(
  dataUrlOrSrc: string,
  maxWidth = THERMAL_LOGO_MAX_WIDTH,
  maxHeight = THERMAL_LOGO_MAX_HEIGHT,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const size = fitThermalLogoDimensions(w, h, maxWidth, maxHeight);

        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrlOrSrc);
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.drawImage(img, 0, 0, size.width, size.height);

        const imgData = ctx.getImageData(0, 0, size.width, size.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const luma = calculatePerceivedLuma(data[i], data[i + 1], data[i + 2], data[i + 3]);
          const bit = luma < 185 ? 0 : 255;
          data[i] = bit;
          data[i + 1] = bit;
          data[i + 2] = bit;
          data[i + 3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrlOrSrc);
      }
    };

    img.onerror = () => resolve(dataUrlOrSrc);
    img.src = dataUrlOrSrc;
  });
}
