/**
 * Utility to optimize logos and images for thermal receipt printing (ESC/POS 203 DPI)
 * 1. Downscales proportionally to recommended thermal dimensions (max 200px width, max 70px height)
 * 2. Enhances contrast and converts color / grayscale pixels into pure high-contrast monochrome (pure black)
 * 3. Removes grayish dithering haze and makes background transparent
 * 4. Yields a lightweight PNG data URL (~2KB - 5KB) ensuring razor-sharp thermal head printing
 */
export function optimizeImageForThermal(
  dataUrlOrSrc: string,
  maxWidth = 200,
  maxHeight = 70,
  threshold = 185
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        if (origW === 0 || origH === 0) {
          resolve(dataUrlOrSrc);
          return;
        }

        // Maintain aspect ratio within bounding box
        const scale = Math.min(maxWidth / origW, maxHeight / origH, 1);
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(dataUrlOrSrc);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Transparent pixels remain transparent
          if (a < 35) {
            data[i + 3] = 0;
            continue;
          }

          // Perceived luminance formula (ITU-R BT.601)
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          // If pixel is dark enough or non-white, turn into crisp pure black
          if (lum < threshold) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            // Crisp alpha edge
            data[i + 3] = a > 200 ? 255 : Math.min(255, Math.round(a * 1.3));
          } else {
            // White or light background turned into transparent
            data[i + 3] = 0;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        // In case canvas security prevents reading tainted canvas
        console.warn('Thermal optimizer fallback:', err);
        resolve(dataUrlOrSrc);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for thermal receipt optimization'));
    };

    img.src = dataUrlOrSrc;
  });
}
