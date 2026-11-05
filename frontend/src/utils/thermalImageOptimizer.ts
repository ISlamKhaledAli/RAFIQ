/**
 * Pure mathematical and image processing functions for thermal receipt logos (ESC/POS 203 DPI)
 * Ensures high contrast, zero pixelation, automatic margin trimming, and smooth anti-aliased edges.
 */

export const THERMAL_LOGO_MAX_WIDTH = 550;
export const THERMAL_LOGO_MAX_HEIGHT = 220;
export const THERMAL_LUMA_DARK_THRESHOLD = 140;
export const THERMAL_LUMA_LIGHT_THRESHOLD = 238;
export const THERMAL_CROP_PADDING = 4;

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
 * Optimizes store logos for thermal receipt printing (ESC/POS 203 DPI) and high-DPI screen preview.
 * 1. Safe working canvas reduction for ultra-large mobile camera photos (prevents browser freezing).
 * 2. Automatic content margin trimming (crops blank outer borders so the logo fills the receipt properly).
 * 3. Proportional scaling to optimal thermal dimensions (up to 550x220, never stretched or upscaled).
 * 4. High-contrast monochrome conversion with smooth anti-aliased edge preservation (prevents stair-stepping pixelation).
 * 5. Returns a lightweight, high-density PNG data URL.
 */
export function optimizeImageForThermal(
  dataUrlOrSrc: string,
  maxWidth = THERMAL_LOGO_MAX_WIDTH,
  maxHeight = THERMAL_LOGO_MAX_HEIGHT,
): Promise<string> {
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

        // 3. Transform pixels into pure monochrome with anti-aliased edge alpha
        const finalData = finalCtx.getImageData(0, 0, targetSize.width, targetSize.height);
        const pixels = finalData.data;

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
