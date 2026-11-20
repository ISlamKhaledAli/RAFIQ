/**
 * Client-side browser image compressor for Cloud-Only Product Images (Design Doc Section 3).
 * Resizes proportionally to <= 800x800px and encodes as WebP (~60-150KB) directly on the
 * store owner's phone/browser before uploading to Cloudflare R2 (zero Worker CPU cost).
 */
export async function compressProductImage(
  file: File,
  maxDimension = 800,
  maxBytes = 500 * 1024
): Promise<{ blob: Blob; contentType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
      el.src = objectUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('المتصفح لا يدعم ضغط الصور');
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const toBlob = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

    // Prefer WebP; fall back to JPEG on older Safari/iOS WebViews
    let blob = await toBlob('image/webp', 0.8);
    let contentType = 'image/webp';

    if (!blob || blob.type !== 'image/webp') {
      blob = await toBlob('image/jpeg', 0.8);
      contentType = 'image/jpeg';
    }

    if (blob && blob.size > maxBytes) {
      const smaller = await toBlob(contentType, 0.62);
      if (smaller) blob = smaller;
    }

    if (!blob || blob.size > maxBytes) {
      throw new Error('حجم الصورة كبير جداً حتى بعد الضغط؛ يرجى اختيار صورة أصغر.');
    }

    return { blob, contentType };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
